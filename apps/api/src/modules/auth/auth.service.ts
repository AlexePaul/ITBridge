import { BadRequestException, ConflictException, Injectable, Logger, NotFoundException, UnauthorizedException } from '@nestjs/common';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import { RegisterDto } from 'src/modules/auth/dto/register.dto';
import { User, isAccountActive } from 'src/entities/user.entity';
import { Profile, isProfileComplete } from 'src/entities/profile.entity';
import { DocumentAcceptance } from 'src/entities/document-acceptance.entity';
import { ACCEPTED_AT_REGISTRATION, LEGAL_DOCUMENT_VERSIONS } from './legal-documents';
import { acceptedInWords, outstandingDocuments } from './legal-acceptance.rules';
import { AcceptDocumentsDto } from 'src/modules/auth/dto/accept-documents.dto';
import { LegalDocument } from 'src/enum/legal-document.enum';
import { DataSource, EntityManager, Repository } from 'typeorm';
import * as bcrypt from 'bcrypt';
import { randomUUID } from 'crypto';
import { LoginDto } from 'src/modules/auth/dto/login.dto';
import { JwtService } from '@nestjs/jwt';
import { RefreshTokenDto } from 'src/modules/auth/dto/refreshToken.dto';
import { jwtConstants } from 'src/constants/jwtConstants';
import { Role } from 'src/enum/role.enum';
import { ApprovalStatus } from 'src/enum/approval-status.enum';
import { SessionService } from './session.service';
import { EmailConfirmationService } from './email-confirmation.service';
import { OutboxService } from 'src/modules/mail/outbox.service';
import { officeAddress } from 'src/modules/mail/office-address';
import { MailTemplateService } from 'src/modules/mail/mail-template.service';
import { approvalsUrl, privacyUrl, profileUrl, termsUrl } from './portal-urls';
import { romanianDay } from 'src/modules/invoice/money-words';
import { schoolDay } from 'src/common/school-clock';
import { AccountClaimService } from './account-claim.service';
import { ClaimAccountDto } from 'src/modules/auth/dto/claimAccount.dto';
import { AuditService } from 'src/modules/audit/audit.service';
import { AuditAction } from 'src/enum/audit-action.enum';

/** What `register` answers when the address belongs to a family the office typed in. */
export const CLAIM_SENT_MESSAGE = 'Familia ta este deja în evidența școlii. Ți-am trimis pe email un link cu care îți termini crearea contului.';

@Injectable()
export class AuthService {
    private readonly logger = new Logger('Auth');

    /** The same address E12's reminder uses, read the same way. */
    private readonly office = officeAddress();

    constructor(
        @InjectRepository(User)
        private userRepository: Repository<User>,
        @InjectRepository(Profile)
        private profileRepository: Repository<Profile>,
        @InjectRepository(DocumentAcceptance)
        private acceptanceRepository: Repository<DocumentAcceptance>,
        private jwtService: JwtService,
        private sessionService: SessionService,
        private emailConfirmationService: EmailConfirmationService,
        private outbox: OutboxService,
        private mailTemplates: MailTemplateService,
        @InjectDataSource() private dataSource: DataSource,
        private accountClaims: AccountClaimService,
        private audit: AuditService,
    ) {}

    /** When a refresh token issued now stops being accepted. */
    private refreshExpiry(): Date {
        return new Date(Date.now() + jwtConstants.refreshTokenExpiration * 1000);
    }

    /**
     * Creates a family: the account, the profile with its contact details, and the link that will
     * confirm the address — E11/S2.
     *
     * All of it in **one transaction**, including the two outbox messages. That is not tidiness. A
     * profile written without its user is a family nobody can log in as; a confirmation row without
     * its user points at nothing; and a "confirm your address" mail sent for a registration that
     * then rolled back is a link that 400s on a parent who did exactly what they were told.
     * `OutboxService.queue` takes the manager for this reason and the epic for the outbox says so
     * in as many words.
     *
     * The account comes back with tokens, as it always did, and the parent is signed in
     * immediately — but into an account that is neither confirmed nor approved and can therefore do
     * very little. That is the deliberate answer to E11's open question: a portal that says "we are
     * looking at your account" is more honest than a login screen that refuses without saying why,
     * and it is also the only place a parent can ask for a new confirmation link.
     */
    async register(
        registerDto: RegisterDto,
        userAgent?: string,
    ): Promise<{ accessToken: string; refreshToken: string; message: string } | { claimSent: true; message: string }> {
        // A family the office typed in from a phone call (`POST /profiles`) — the road most families
        // take in, E11 says — holds this address on a profile with no account. Refusing it as "taken"
        // told the family an account existed when none did, and writing a second shell beside the
        // office's row would split one family in two. So nothing is written here but a link to the
        // address the office typed: opening it proves the mailbox, and the account is created on the
        // office's own row (`claimAccount`). The username typed here is not used; the link's page
        // asks for one again, which is also why this runs before the username is checked.
        const typedByOffice = await this.accountClaims.accountlessProfileFor(registerDto.email);
        if (typedByOffice) {
            await this.dataSource.transaction((manager) => this.accountClaims.issue(typedByOffice, new Date(), manager));
            this.logger.log(`Registration with the address of office-entered profile ${typedByOffice.id}; a claim link was sent instead.`);
            return { claimSent: true, message: CLAIM_SENT_MESSAGE };
        }

        await this.assertUsernameIsFree(registerDto.username);

        // `Profile.email` is a unique column, so the database would refuse a duplicate anyway — as a
        // 500 out of the driver. Checked here so the parent is told which field to change. The race
        // between check and insert is real and is caught by the unique index; it just produces a
        // worse message on the one request in a million that hits it, which is the correct trade.
        //
        // The phone is checked at the same point it is now typed — `ProfileService.updateProfile`,
        // step two — for the same reason and against the same unique column.
        await this.assertEmailIsFree(registerDto.email);

        const saltRounds = 10;
        const passwordHash = await bcrypt.hash(registerDto.password, saltRounds);
        const now = new Date();

        const user = await this.dataSource.transaction(async (manager) => {
            const created = await manager.save(User, {
                username: registerDto.username,
                passwordHash: passwordHash,
                role: Role.PARENT,
                // Both gates shut. Spelled out rather than left to the column default, because the
                // default is a schema detail and this is the rule.
                emailConfirmedAt: null,
                approvalStatus: ApprovalStatus.PENDING,
                approvalDecidedAt: null,
                rejectionReason: null,
            });

            // What was accepted, per document, with the version in force — E22 S4's ledger, first
            // half. Rows rather than a flag on the user: the next version of either document adds
            // a row when it is accepted again, and "which version did this family agree to" keeps
            // its answer. Same transaction as the account: no account without them, no rows without
            // an account.
            const accepted = await manager.save(
                DocumentAcceptance,
                ACCEPTED_AT_REGISTRATION.map((document) => ({ user: created, document, version: LEGAL_DOCUMENT_VERSIONS[document] })),
            );

            // A shell: who they are and where the confirmation goes. The rest is step two, and it
            // is not optional — `isProfileComplete` is what a child's placement is gated on.
            await manager.save(Profile, {
                user: created,
                firstName: registerDto.firstName,
                lastName: registerDto.lastName,
                email: registerDto.email,
            });

            await this.emailConfirmationService.issueAndSend(created, { firstName: registerDto.firstName, email: registerDto.email }, now, manager);

            // Terms §4.7: "primești și un email de confirmare" of the agreement just concluded — what
            // was accepted, which versions, which day. To the address the link above goes to, which
            // nobody has confirmed yet by definition: no `confirmed` flag, so it is not gated on the
            // confirmation it is sent alongside — gated, it would be recorded as undeliverable, and
            // the one message a family is promised at registration would never go.
            await this.queueAcceptanceConfirmation(
                created.id,
                accepted.map(({ id, document }) => ({ id, document })),
                { firstName: registerDto.firstName, email: registerDto.email },
                now,
                manager,
            );

            // The visible signal E11 asks for under "two gates before the first class". Without it,
            // an admin who does not think to open the approvals screen turns a registration into
            // silence, and the family has no way to tell that from a broken platform.
            const parentName = `${registerDto.firstName} ${registerDto.lastName}`;
            const notice = await this.mailTemplates.render('approval-needed', {
                parentName,
                email: registerDto.email,
                // There is no phone yet: it is asked for in step two, which the parent reaches
                // seconds after this mail is queued but has not necessarily finished. Saying so is
                // better than an empty line the reader would read as "they left it blank" — and the
                // approvals screen shows whatever the profile holds by the time anybody opens it.
                phone: 'încă necompletat',
                approvalsUrl: approvalsUrl(),
            });
            await this.outbox.queue({ to: this.office, subject: notice.subject, bodyText: notice.bodyText }, manager);

            return created;
        });

        const tokens = this.generateTokens(user.id, user.username, user.role);
        await this.sessionService.startSession(user, tokens.refreshToken, this.refreshExpiry(), userAgent);

        this.logger.log(`Registered user ${user.id}; awaiting email confirmation and admin approval.`);

        return {
            accessToken: tokens.accessToken,
            refreshToken: tokens.refreshToken,
            message: 'User registered successfully',
        };
    }

    /** Refuses an address or a number that already belongs to another family, naming which. */
    private async assertEmailIsFree(email: string): Promise<void> {
        const byEmail = await this.profileRepository.createQueryBuilder('profile').where('lower(profile.email) = lower(:email)', { email }).getOne();

        if (byEmail) {
            throw new ConflictException({
                message: 'Există deja un cont cu această adresă de email',
                error: 'EMAIL_TAKEN',
            });
        }
    }

    /**
     * Case-insensitive, and registration is public. Comparing exactly let anyone create `Admin` and
     * `ADMIN` alongside a real `admin`, which is an impersonation vector in a UI that shows usernames
     * — and inconsistent with every other lookup in the app, all of which already compare with
     * `lower()`. Shared by both ways an account is born, so neither is the easier one.
     */
    private async assertUsernameIsFree(username: string): Promise<void> {
        const preExistingUser = await this.userRepository.createQueryBuilder('user').where('lower(user.username) = lower(:username)', { username }).getOne();

        if (preExistingUser) {
            throw new ConflictException({
                message: 'Există deja un cont cu acest nume de utilizator',
                error: 'USERNAME_TAKEN',
            });
        }
    }

    /**
     * Creates the account of a family the office typed in, from the link `register` or the office
     * sent to the address on its profile — E11 S2, review of 26 September 2026.
     *
     * One transaction, like `register`, and doing what `register` does where it applies: the account
     * is born on the office's row rather than beside it, the acceptances are written and confirmed,
     * the office hears that somebody is waiting. Three differences, each a consequence of the link:
     *
     * - **`emailConfirmedAt` is now.** Opening the link sent to the address on file is precisely the
     *   proof the confirmation link asks for, so asking for it again would be a second click proving
     *   the same thing.
     * - **`approvalStatus` stays `PENDING`.** The office knows the family, but not yet that this
     *   account is theirs rather than whoever else reads that inbox; the approval is still the
     *   school's to give, as it is for every other account.
     * - **No shell profile, and no name typed here.** The office's row is the family; the link
     *   attaches the account to it, and step two (`/user/profile-setup`) asks for whatever the office
     *   did not write down.
     *
     * The trail records it through `recordPersonalDataChange` — field names only — with the new
     * account as the actor: nobody signed in pressed anything, and the family did.
     */
    async claimAccount(dto: ClaimAccountDto, userAgent?: string) {
        await this.assertUsernameIsFree(dto.username);

        const passwordHash = await bcrypt.hash(dto.password, 10);
        const now = new Date();

        const user = await this.dataSource.transaction(async (manager) => {
            const profile = await this.accountClaims.redeem(dto.token, now, manager);

            const created = await manager.save(User, {
                username: dto.username,
                passwordHash,
                role: Role.PARENT,
                emailConfirmedAt: now,
                approvalStatus: ApprovalStatus.PENDING,
                approvalDecidedAt: null,
                rejectionReason: null,
            });
            await manager.update(Profile, { id: profile.id }, { user: { id: created.id } });

            const accepted = await manager.save(
                DocumentAcceptance,
                ACCEPTED_AT_REGISTRATION.map((document) => ({ user: created, document, version: LEGAL_DOCUMENT_VERSIONS[document] })),
            );
            await this.queueAcceptanceConfirmation(
                created.id,
                accepted.map(({ id, document }) => ({ id, document })),
                { firstName: profile.firstName, email: profile.email ?? null, confirmed: true },
                now,
                manager,
            );

            const notice = await this.mailTemplates.render('approval-needed', {
                parentName: `${profile.firstName} ${profile.lastName}`,
                email: profile.email ?? '',
                phone: profile.phone ?? 'încă necompletat',
                approvalsUrl: approvalsUrl(),
            });
            await this.outbox.queue({ to: this.office, subject: notice.subject, bodyText: notice.bodyText }, manager);

            await this.audit.recordPersonalDataChange(
                {
                    actor: { userId: created.id, username: created.username },
                    action: AuditAction.UPDATED,
                    entityType: 'Profile',
                    entityId: profile.id,
                    fields: ['user'],
                    note: 'cont creat de familie din linkul trimis la adresa din fișă',
                },
                manager,
            );

            return created;
        });

        const tokens = this.generateTokens(user.id, user.username, user.role);
        await this.sessionService.startSession(user, tokens.refreshToken, this.refreshExpiry(), userAgent);

        this.logger.log(`Account ${user.id} created from a claim link; awaiting admin approval.`);

        return {
            accessToken: tokens.accessToken,
            refreshToken: tokens.refreshToken,
            message: 'Account created',
        };
    }

    /**
     * Opens the first gate, and reports the state of both.
     *
     * Public — no guard. The parent clicking the link in their mail may well be on a device that
     * has never signed in, and requiring a session first would make confirmation depend on the
     * account it is trying to unlock.
     */
    async confirmEmail(token: string) {
        const user = await this.emailConfirmationService.confirm(token);
        return {
            message: 'Adresa de email a fost confirmată',
            emailConfirmed: true,
            approvalStatus: user.approvalStatus,
            active: isAccountActive(user),
        };
    }

    /**
     * Issues a second link to the address on file.
     *
     * Authenticated, and it deliberately does not take an address: a resend endpoint that accepted
     * one would let anyone holding a session point the confirmation at a mailbox of their choosing,
     * which is the whole gate, undone. Changing the address on file is a profile edit, and it is
     * that edit's job to reopen the gate.
     */
    async resendConfirmation(userId: number) {
        const user = await this.userRepository.findOne({ where: { id: userId } });
        if (!user) {
            throw new NotFoundException('User not found');
        }

        if (user.emailConfirmedAt !== null) {
            throw new BadRequestException({
                message: 'Adresa de email este deja confirmată',
                error: 'EMAIL_ALREADY_CONFIRMED',
            });
        }

        const profile = await this.profileRepository.findOne({ where: { user: { id: userId } } });
        if (!profile?.email) {
            throw new BadRequestException({
                message: 'Contul nu are o adresă de email pe care să trimitem confirmarea',
                error: 'NO_EMAIL_ON_FILE',
            });
        }

        const now = new Date();
        await this.dataSource.transaction(async (manager) =>
            this.emailConfirmationService.issueAndSend(user, { firstName: profile.firstName, email: profile.email as string }, now, manager),
        );

        this.logger.log(`Reissued an email confirmation for user ${userId}.`);
        return { message: 'Am retrimis linkul de confirmare' };
    }

    async login(loginDto: LoginDto, userAgent?: string) {
        // Matched the same way registration checks for collisions, so the account you are stopped
        // from creating is the account you can sign in to.
        // `addSelect`, because the column is `select: false` on the entity: this is the one place in
        // the application that needs the hash, and the only one that asks for it.
        const user = await this.userRepository
            .createQueryBuilder('user')
            .addSelect('user.passwordHash')
            .where('lower(user.username) = lower(:username)', { username: loginDto.username })
            .getOne();

        if (!user) {
            throw new UnauthorizedException('Invalid credentials');
        }

        const isPasswordValid = await bcrypt.compare(loginDto.password, user.passwordHash);

        if (!isPasswordValid) {
            throw new UnauthorizedException('Invalid credentials');
        }

        const tokens = this.generateTokens(user.id, user.username, user.role);
        await this.sessionService.startSession(user, tokens.refreshToken, this.refreshExpiry(), userAgent);

        return {
            accessToken: tokens.accessToken,
            refreshToken: tokens.refreshToken,
            message: 'Login successful',
        };
    }

    async refreshToken(refreshTokenDto: RefreshTokenDto, userAgent?: string) {
        const refreshToken = refreshTokenDto.refreshToken;
        let payload: { sub: number };
        try {
            payload = this.jwtService.verify(refreshToken, {
                secret: jwtConstants.refreshTokenSecret,
            });
        } catch {
            throw new UnauthorizedException('Invalid refresh token');
        }

        const user = await this.userRepository.findOne({
            where: { id: payload.sub },
        });

        if (!user) {
            throw new UnauthorizedException('Invalid refresh token');
        }
        // Rotation: the presented token is consumed and replaced. A signature that verifies is no
        // longer enough — the token also has to be the live one for its session.
        const tokens = this.generateTokens(user.id, user.username, user.role);
        await this.sessionService.rotate(refreshToken, tokens.refreshToken, this.refreshExpiry(), userAgent);

        return {
            accessToken: tokens.accessToken,
            refreshToken: tokens.refreshToken,
            message: 'Token refreshed successfully',
        };
    }

    /** Real logout: the refresh token stops working immediately, rather than in seven days. */
    async logout(refreshToken: string): Promise<{ message: string }> {
        await this.sessionService.revoke(refreshToken);
        return { message: 'Logged out' };
    }

    async logoutEverywhere(userId: number): Promise<{ message: string }> {
        await this.sessionService.revokeAllForUser(userId);
        return { message: 'All sessions ended' };
    }

    async listSessions(userId: number, currentRefreshToken?: string) {
        return this.sessionService.listActive(userId, currentRefreshToken);
    }

    /**
     * Who the caller is, plus the state of both gates.
     *
     * The gate fields are here rather than on a screen of their own because every page of the
     * portal has to know: a pending account is shown a waiting notice instead of an empty dashboard
     * that looks like a bug. `active` is computed rather than stored — see `isAccountActive`.
     */
    async getUserProfile(userId: number) {
        const user = await this.userRepository.findOne({
            where: { id: userId },
            select: ['id', 'username', 'role', 'createdAt', 'emailConfirmedAt', 'approvalStatus'],
        });
        if (!user) {
            return null;
        }

        // Step two of registration is a third thing that can be pending, and it belongs on this
        // payload for the reason the gates do: every page has to know, and the one that has to know
        // first is the middleware that decides whether to send the parent to finish it. Derived
        // here and sent as a boolean so the client never owns a second copy of the rule.
        const profile = await this.profileRepository.findOne({
            where: { user: { id: userId } },
            select: ['id', 'email', 'phone', 'address', 'emergencyContactName', 'emergencyContactRelation', 'emergencyContactPhone'],
        });

        return {
            id: user.id,
            username: user.username,
            role: user.role,
            createdAt: user.createdAt,
            emailConfirmed: user.emailConfirmedAt !== null,
            approvalStatus: user.approvalStatus,
            active: isAccountActive(user),
            // An admin has no profile and needs none; `false` here would send them to a form that
            // is not theirs to fill in.
            profileComplete: user.role === Role.ADMIN || (profile !== null && isProfileComplete(profile)),
            pendingLegalDocuments: await this.pendingLegalDocuments(user),
        };
    }

    /**
     * What terms §18 promises: at the first sign-in after a new version, the portal asks for it.
     *
     * Derived here and sent as a list, for the reason `profileComplete` is derived here — the
     * portal must not own a second copy of a rule the server keeps, or the screen that redirects
     * and the ledger that records would disagree about the same family. The rule itself is
     * `outstandingDocuments`, which is pure and has its own spec; this method is only the read.
     *
     * Empty for an admin. The terms are the parent's contract with the school and an admin is the
     * school; asking the office to accept them would also mean that a version bump could lock the
     * only people who can fix it out of the admin area, which is the kind of gate that gets
     * disabled rather than passed.
     */
    private async pendingLegalDocuments(user: Pick<User, 'id' | 'role'>): Promise<LegalDocument[]> {
        if (user.role === Role.ADMIN) {
            return [];
        }

        const accepted = await this.acceptanceRepository.find({
            where: { user: { id: user.id } },
            select: ['document', 'version'],
        });

        return outstandingDocuments(accepted);
    }

    /**
     * Records that this family accepts the documents it names — E22 S4, second half.
     *
     * Only what is outstanding is written, so the second click of a double-click adds nothing and
     * a document already accepted in the version in force keeps the day it was first accepted.
     * Rows are never updated: the ledger's whole point is that "which version did they agree to,
     * and when" keeps its answer for every version, not just the newest.
     *
     * A list that leaves something outstanding is refused rather than half-recorded. The screen
     * would otherwise send the parent back to itself with nothing said, and the one case where
     * that matters is the one art. 1203 is about: ticking the terms and not the clauses inside them.
     */
    async acceptDocuments(userId: number, dto: AcceptDocumentsDto) {
        const user = await this.userRepository.findOne({ where: { id: userId }, select: ['id', 'role'] });
        if (!user) {
            throw new NotFoundException('User not found');
        }

        const outstanding = await this.pendingLegalDocuments(user);
        const offered = new Set(dto.documents);
        const missing = outstanding.filter((document) => !offered.has(document));

        if (missing.length > 0) {
            throw new BadRequestException({
                message: 'Trebuie acceptate toate documentele cerute, inclusiv clauzele care se acceptă separat',
                error: 'LEGAL_ACCEPTANCE_INCOMPLETE',
            });
        }

        if (outstanding.length > 0) {
            await this.dataSource.transaction(async (manager) => {
                // `ON CONFLICT DO NOTHING` against `UQ_document_acceptance_user_document_version`,
                // rather than trusting the read above: two submits in the same second both see the
                // same thing outstanding, and the second one is not an error to report — the family
                // did accept, and the row saying so is already there with the day it happened on it.
                const inserted = await manager
                    .getRepository(DocumentAcceptance)
                    .createQueryBuilder()
                    .insert()
                    .values(outstanding.map((document) => ({ user: { id: userId }, document, version: LEGAL_DOCUMENT_VERSIONS[document] })))
                    .orIgnore()
                    .returning(['id', 'document'])
                    .execute();
                // What this submit wrote, not what it asked for: a concurrent submit may have
                // written some of the rows first, and the confirmation says what happened here.
                const written = inserted.raw as { id: number; document: LegalDocument }[];
                if (written.length === 0) return;

                // Terms §4.7 again: a new version accepted is an agreement concluded again, and it is
                // confirmed the same way. Only by the submit that wrote the rows — the second click
                // of a double-click wrote nothing, and its family already has the message.
                const account = await manager.findOne(User, { where: { id: userId }, select: { id: true, emailConfirmedAt: true } });
                const profile = await manager.findOne(Profile, { where: { user: { id: userId } } });
                if (profile) {
                    await this.queueAcceptanceConfirmation(
                        userId,
                        written,
                        { firstName: profile.firstName, email: profile.email ?? null, confirmed: Boolean(account?.emailConfirmedAt) },
                        new Date(),
                        manager,
                    );
                }
            });
            this.logger.log(`User ${userId} accepted ${outstanding.join(', ')}.`);
        }

        return { pendingLegalDocuments: [] as LegalDocument[] };
    }

    /**
     * The caller's own acceptance record — terms §4.7: the version accepted, with its day, stays on
     * the account and can be read again from the portal. The whole ledger, oldest first, and what
     * is in force today beside it.
     */
    async legalRecord(userId: number): Promise<{
        inForce: { document: LegalDocument; version: string }[];
        accepted: { document: LegalDocument; version: string; acceptedAt: Date }[];
    }> {
        const rows = await this.acceptanceRepository.find({ where: { user: { id: userId } }, order: { acceptedAt: 'ASC', id: 'ASC' } });
        return {
            inForce: (Object.keys(LEGAL_DOCUMENT_VERSIONS) as LegalDocument[]).map((document) => ({ document, version: LEGAL_DOCUMENT_VERSIONS[document] })),
            accepted: rows.map((row) => ({ document: row.document, version: row.version, acceptedAt: row.acceptedAt })),
        };
    }

    /**
     * The confirmation terms §4.7 promises — one message per acceptance written.
     *
     * Keyed on the ledger rows it confirms: the rows are unique per account, document and version,
     * so a double-click that wrote nothing the second time sends nothing, and every acceptance that
     * did write something is confirmed exactly once. Says what was accepted *in this act* — a new
     * privacy notice accepted in March is not the terms accepted again — and, beside it, the
     * versions in force, which after an acceptance are exactly what the family has agreed to.
     */
    private async queueAcceptanceConfirmation(
        userId: number,
        rows: { id: number; document: LegalDocument }[],
        recipient: { firstName: string; email: string | null; confirmed?: boolean },
        now: Date,
        manager: EntityManager,
    ): Promise<void> {
        const day = schoolDay(now);
        const mail = await this.mailTemplates.render('legal-acceptance', {
            firstName: recipient.firstName,
            acceptedOn: `${romanianDay(day)} ${day.slice(0, 4)}`,
            accepted: acceptedInWords(rows.map((row) => row.document)),
            termsVersion: LEGAL_DOCUMENT_VERSIONS[LegalDocument.TERMS],
            privacyVersion: LEGAL_DOCUMENT_VERSIONS[LegalDocument.PRIVACY],
            termsUrl: termsUrl(),
            privacyUrl: privacyUrl(),
            profileUrl: profileUrl(),
        });
        await this.outbox.queueOrRecord(
            { email: recipient.email, confirmed: recipient.confirmed },
            {
                subject: mail.subject,
                bodyText: mail.bodyText,
                bodyHtml: mail.bodyHtml ?? undefined,
                dedupeKey: `legal-acceptance:${userId}:${rows
                    .map((row) => row.id)
                    .sort((a, b) => a - b)
                    .join('-')}`,
            },
            manager,
        );
    }

    private generateTokens(userId: number, username: string, role: string) {
        const accessTokenPayload = { sub: userId, username, role };

        // `jti` is what makes two refresh tokens distinct. Without it the payload is just `{ sub }`
        // plus second-resolution `iat`/`exp`, so two logins within the same second produce a
        // byte-identical JWT — and the sessions table, which keys on the token hash, rejects the
        // second one as a duplicate.
        const refreshTokenPayload = { sub: userId, jti: randomUUID() };

        const accessToken = this.jwtService.sign(accessTokenPayload, {
            secret: jwtConstants.accessTokenSecret,
            expiresIn: jwtConstants.accessTokenExpiration,
        });

        const refreshToken = this.jwtService.sign(refreshTokenPayload, {
            secret: jwtConstants.refreshTokenSecret,
            expiresIn: jwtConstants.refreshTokenExpiration,
        });
        return {
            accessToken: accessToken,
            refreshToken: refreshToken,
        };
    }
}
