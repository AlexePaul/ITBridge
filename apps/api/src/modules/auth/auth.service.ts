import { BadRequestException, ConflictException, Injectable, Logger, NotFoundException, UnauthorizedException } from '@nestjs/common';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import { RegisterDto } from 'src/modules/auth/dto/register.dto';
import { User, isAccountActive } from 'src/entities/user.entity';
import { Profile } from 'src/entities/profile.entity';
import { DataSource, Repository } from 'typeorm';
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
import { composeApprovalNeeded, composeEmailConfirmation } from './account-mail';
import { approvalsUrl, emailConfirmationUrl } from './portal-urls';

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
        private jwtService: JwtService,
        private sessionService: SessionService,
        private emailConfirmationService: EmailConfirmationService,
        private outbox: OutboxService,
        @InjectDataSource() private dataSource: DataSource,
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
    async register(registerDto: RegisterDto, userAgent?: string) {
        // Case-insensitive, and registration is public. Comparing exactly let anyone create
        // `Admin` and `ADMIN` alongside a real `admin`, which is an impersonation vector in a UI
        // that shows usernames — and inconsistent with every other lookup in the app, all of which
        // already compare with `lower()`.
        const preExistingUser = await this.userRepository
            .createQueryBuilder('user')
            .where('lower(user.username) = lower(:username)', { username: registerDto.username })
            .getOne();

        if (preExistingUser) {
            throw new ConflictException({
                message: 'Există deja un cont cu acest nume de utilizator',
                error: 'USERNAME_TAKEN',
            });
        }

        // `Profile.email` and `Profile.phone` are both unique columns, so the database would refuse
        // these anyway — as a 500 out of the driver. Checked here so the parent is told which of
        // the two fields to change. The race between check and insert is real and is caught by the
        // unique index; it just produces a worse message on the one request in a million that hits
        // it, which is the correct trade.
        await this.assertContactDetailsAreFree(registerDto.email, registerDto.phone);

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

            await manager.save(Profile, {
                user: created,
                firstName: registerDto.firstName,
                lastName: registerDto.lastName,
                email: registerDto.email,
                phone: registerDto.phone,
                address: registerDto.address,
                emergencyContactName: registerDto.emergencyContactName,
                emergencyContactRelation: registerDto.emergencyContactRelation,
                emergencyContactPhone: registerDto.emergencyContactPhone,
            });

            const { token } = await this.emailConfirmationService.issueFor(created, registerDto.email, now, manager);

            const confirmation = composeEmailConfirmation(registerDto.firstName, emailConfirmationUrl(token));
            await this.outbox.queue({ to: registerDto.email, subject: confirmation.subject, bodyText: confirmation.bodyText }, manager);

            // The visible signal E11 asks for under "two gates before the first class". Without it,
            // an admin who does not think to open the approvals screen turns a registration into
            // silence, and the family has no way to tell that from a broken platform.
            const parentName = `${registerDto.firstName} ${registerDto.lastName}`;
            const notice = composeApprovalNeeded(parentName, registerDto.email, registerDto.phone, approvalsUrl());
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
    private async assertContactDetailsAreFree(email: string, phone: string): Promise<void> {
        const byEmail = await this.profileRepository.createQueryBuilder('profile').where('lower(profile.email) = lower(:email)', { email }).getOne();

        if (byEmail) {
            throw new ConflictException({
                message: 'Există deja un cont cu această adresă de email',
                error: 'EMAIL_TAKEN',
            });
        }

        const byPhone = await this.profileRepository.findOne({ where: { phone } });
        if (byPhone) {
            throw new ConflictException({
                message: 'Există deja un cont cu acest număr de telefon',
                error: 'PHONE_TAKEN',
            });
        }
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
        await this.dataSource.transaction(async (manager) => {
            const { token } = await this.emailConfirmationService.issueFor(user, profile.email as string, now, manager);
            const mail = composeEmailConfirmation(profile.firstName, emailConfirmationUrl(token));
            await this.outbox.queue({ to: profile.email as string, subject: mail.subject, bodyText: mail.bodyText }, manager);
        });

        this.logger.log(`Reissued an email confirmation for user ${userId}.`);
        return { message: 'Am retrimis linkul de confirmare' };
    }

    async login(loginDto: LoginDto, userAgent?: string) {
        // Matched the same way registration checks for collisions, so the account you are stopped
        // from creating is the account you can sign in to.
        const user = await this.userRepository
            .createQueryBuilder('user')
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

    async listSessions(userId: number) {
        return this.sessionService.listActive(userId);
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
        return {
            id: user.id,
            username: user.username,
            role: user.role,
            createdAt: user.createdAt,
            emailConfirmed: user.emailConfirmedAt !== null,
            approvalStatus: user.approvalStatus,
            active: isAccountActive(user),
        };
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
