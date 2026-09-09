import { ConflictException, Injectable, NotFoundException, UnauthorizedException } from '@nestjs/common';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import { Profile } from 'src/entities/profile.entity';
import { Child } from 'src/entities/child.entity';
import { Invoice } from 'src/entities/invoice.entity';
import { CreateProfileDto } from './dto/createProfile.dto';
import { User } from 'src/entities/user.entity';
import { Role } from 'src/enum/role.enum';
import { FilterProfileDto } from './dto/filterProfile.dto';
import { DataSource, Repository } from 'typeorm';
import { UpdateProfileDto } from './dto/updateProfile.dto';
import { applyDefined } from 'src/common/apply-defined';
import { AuditService, type Actor } from 'src/modules/audit/audit.service';
import { AuditAction } from 'src/enum/audit-action.enum';
import { changedFieldNames } from 'src/modules/audit/personal-fields';
import { EmailConfirmationService } from 'src/modules/auth/email-confirmation.service';
import { movesTheAddress } from './address-change';

@Injectable()
export class ProfileService {
    constructor(
        @InjectRepository(Profile) private readonly profileRepository: Repository<Profile>,
        @InjectRepository(Child) private readonly childRepository: Repository<Child>,
        @InjectRepository(Invoice) private readonly invoiceRepository: Repository<Invoice>,
        @InjectDataSource() private readonly dataSource: DataSource,
        private readonly audit: AuditService,
        private readonly confirmations: EmailConfirmationService,
    ) {}

    async createProfile(createProfileDto: CreateProfileDto, userRole: Role, userId: number | undefined, actor: Actor) {
        if (userRole !== Role.ADMIN) {
            createProfileDto.userId = userId;
        }
        if (createProfileDto.userId) {
            const existingProfile = await this.profileRepository.findOne({ where: { user: { id: createProfileDto.userId } } });
            if (existingProfile) {
                throw new ConflictException('Profile already exists for this user');
            }
        }
        // The guards matter: `findOne({ where: { email: undefined } })` drops the undefined
        // condition and degenerates into "find any profile", so a profile with no contact details
        // used to collide with the first row in the table. Contact fields are nullable by design —
        // an admin creates a profile with just a name and links an account later.
        if (createProfileDto.email) {
            const existingEmail = await this.profileRepository.findOne({ where: { email: createProfileDto.email } });
            if (existingEmail) {
                throw new ConflictException('Email is already in use');
            }
        }
        if (createProfileDto.phone) {
            const existingPhone = await this.profileRepository.findOne({ where: { phone: createProfileDto.phone } });
            if (existingPhone) {
                throw new ConflictException('Phone number is already in use');
            }
        }
        const profile = this.profileRepository.create({
            ...createProfileDto,
            user: (createProfileDto.userId ? { id: createProfileDto.userId } : null) as User,
        });
        // Row and trail in one transaction — E07/S3. They were two loose statements, so a failure
        // between them left a family on file with nothing saying who put it there.
        return this.dataSource.transaction(async (manager) => {
            const saved = await manager.save(Profile, profile);
            // The act and the id, not the contact details that came with it. A family entered over
            // the phone has no other record of who entered it.
            await this.audit.recordPersonalDataChange(
                {
                    actor,
                    action: AuditAction.CREATED,
                    entityType: 'Profile',
                    entityId: saved.id,
                    fields: ['profile'],
                    note: 'profil creat',
                },
                manager,
            );
            return saved;
        });
    }

    async findProfiles(filters: FilterProfileDto, userRole: Role, userId: number) {
        if (userRole !== Role.ADMIN) {
            filters.userId = userId;
        }
        const queryBuilder = this.profileRepository
            .createQueryBuilder('profile')
            .leftJoinAndSelect('profile.user', 'user')
            .leftJoinAndSelect('profile.children', 'child')
            .leftJoinAndSelect('child.group', 'group')
            // Same reason as in `ChildService.findChildren`: the contract's `Group` has a room.
            .leftJoinAndSelect('group.room', 'room')
            .leftJoinAndSelect('room.location', 'location');

        if (filters.userId) {
            queryBuilder.andWhere('user.id = :userId', { userId: filters.userId });
        }
        if (filters.email) {
            queryBuilder.andWhere('lower(profile.email) = lower(:email)', { email: filters.email });
        }
        if (filters.phone) {
            queryBuilder.andWhere('lower(profile.phone) = lower(:phone)', { phone: filters.phone });
        }
        if (filters.firstName) {
            queryBuilder.andWhere('lower(profile.firstName) = lower(:firstName)', { firstName: filters.firstName });
        }
        if (filters.lastName) {
            queryBuilder.andWhere('lower(profile.lastName) = lower(:lastName)', { lastName: filters.lastName });
        }
        if (filters.profileId) {
            queryBuilder.andWhere('profile.id = :profileId', { profileId: filters.profileId });
        }

        const profiles = await queryBuilder.getMany();
        const profilesReturnObject = profiles
            .map((profile) => ({
                ...profile,
                hasUser: profile.user !== null,
            }))
            .map((profile) => {
                profile.user = undefined;
                return profile;
            });
        return profilesReturnObject;
    }

    async updateProfile(updateProfileDto: UpdateProfileDto, profileId: number, userRole: Role, userId: number, actor: Actor) {
        const profile = await this.profileRepository.findOne({
            where: { id: profileId },
            relations: ['user'],
        });

        if (!profile) {
            throw new NotFoundException('Profile not found');
        }

        if (userRole !== Role.ADMIN && profile.user?.id !== userId) {
            throw new UnauthorizedException('You do not have permission to update this profile');
        }

        if (updateProfileDto.email && updateProfileDto.email !== profile.email) {
            const existingEmail = await this.profileRepository.findOne({ where: { email: updateProfileDto.email } });
            if (existingEmail) {
                throw new ConflictException('Email is already in use');
            }
        }

        if (updateProfileDto.phone && updateProfileDto.phone !== profile.phone) {
            const existingPhone = await this.profileRepository.findOne({ where: { phone: updateProfileDto.phone } });
            if (existingPhone) {
                throw new ConflictException('Phone number is already in use');
            }
        }

        // Read before the merge: which fields move, never what they become. The values are held
        // under a different retention rule from this trail (E07 S1), and copying them across would
        // leave them here after the family itself is erased — see `recordPersonalDataChange`.
        const moved = changedFieldNames(profile as unknown as Record<string, unknown>, updateProfileDto as unknown as Record<string, unknown>);

        // A changed address is an unproven one, and the gate has to close behind it — E11/S2.
        // `AuthService.resendConfirmation` already says whose job this is, in as many words: it
        // refuses to take an address precisely so that nobody can point a confirmation somewhere
        // else, and leaves reopening the gate to the edit that moved it. The edit never did, so
        // `emailConfirmedAt` went on standing for an address the family had stopped using — and
        // `queueOrRecord`'s `confirmed` check, which exists to keep mail away from unverified
        // addresses, read it and let everything through.
        //
        // Whose account it is does not matter: an admin fixing a typo has proved no more than the
        // family would have. The new link goes out in the same transaction, so the way back is one
        // click rather than a phone call.
        const addressChanged = movesTheAddress(profile, updateProfileDto);

        applyDefined(profile, updateProfileDto);
        const updatedProfile = await this.dataSource.transaction(async (manager) => {
            const saved = await manager.save(Profile, profile);
            if (addressChanged && profile.user) {
                await manager.update(User, profile.user.id, { emailConfirmedAt: null });
                // The link goes only where there is somewhere to send it. Clearing the address
                // cannot happen through `UpdateProfileDto` today — `@IsEmail()` refuses an empty
                // value — but the gate closing and the link going out are two facts, not one, and
                // writing them as one is how the second silently swallows the first.
                if (saved.email) {
                    await this.confirmations.issueAndSend(profile.user, { firstName: saved.firstName, email: saved.email }, new Date(), manager);
                }
            }
            // Inside the transaction the edit already opened, not after it: a trail written on its
            // own connection is one that can be lost while the change it describes stands.
            await this.audit.recordPersonalDataChange(
                {
                    actor,
                    action: AuditAction.UPDATED,
                    entityType: 'Profile',
                    entityId: profileId,
                    fields: moved,
                },
                manager,
            );
            return saved;
        });
        updatedProfile.user = undefined;
        return updatedProfile;
    }

    /**
     * Removes a profile row — and only a row that is on its own.
     *
     * **This is not a way to delete a family.** `children.parent_id`, `invoices.parent_id` and
     * `discounts.parent_id` are all `CASCADE`, and `payments.invoice_id` is `CASCADE` after that,
     * so deleting the row used to take the children, every mark of attendance against them, every
     * project they ever saved, every invoice the school issued and every payment it recorded —
     * silently, in one statement, from a screen whose own words promised the opposite.
     *
     * Keeping the invoices is not a preference. E04/S5 decided the platform keeps the evidence of
     * what a family paid even though the fiscal document is SmartBill's, and E07/S4 goes to the
     * trouble of leaving an emptied shell row behind *precisely because* `Invoice.parent` cascades.
     * A second door that skips all of that is the first one's undoing.
     *
     * So both are refused in the service, with their own codes, the way `RESTRICT` is checked for
     * locations and rooms: the client gets a 409 that says which thing is in the way, rather than a
     * 500 from the driver or — worse, and what happened here — a 204 and no data. A family that
     * asked to be forgotten goes through `/admin/stergeri`, which keeps the invoices, empties the
     * row, clears the bucket and writes down who did it.
     */
    async deleteProfile(profileId: number, userRole: Role, userId: number, actor: Actor) {
        const profile = await this.profileRepository.findOne({
            where: { id: profileId },
            relations: ['user'],
        });

        if (!profile) {
            throw new NotFoundException('Profile not found');
        }

        if (userRole !== Role.ADMIN && profile.user?.id !== userId) {
            throw new UnauthorizedException('You do not have permission to delete this profile');
        }

        // The money first: it is the one the platform promised to keep.
        if (await this.invoiceRepository.exists({ where: { parent: { id: profileId } } })) {
            throw new ConflictException({
                message: 'Familia are facturi emise, care nu se pot șterge. Pentru o cerere de ștergere, folosește ecranul de ștergeri.',
                error: 'PROFILE_HAS_INVOICES',
            });
        }

        if (await this.childRepository.exists({ where: { parent: { id: profileId } } })) {
            throw new ConflictException({
                message: 'Familia are copii înregistrați. Șterge-i întâi pe ei, sau folosește ecranul de ștergeri.',
                error: 'PROFILE_HAS_CHILDREN',
            });
        }

        // The removal and its trail commit together. Of the three this matters most here: after the
        // row is gone the trail is the only thing that can answer who removed it, so losing it
        // leaves the question unanswerable rather than merely unanswered.
        await this.dataSource.transaction(async (manager) => {
            await manager.delete(Profile, profileId);
            // The act, not the contents. A deleted profile leaving a copy of itself in the trail is
            // the failure this whole half exists to avoid.
            await this.audit.recordPersonalDataChange(
                {
                    actor,
                    action: AuditAction.DELETED,
                    entityType: 'Profile',
                    entityId: profileId,
                    fields: ['profile'],
                    note: 'profil șters de la ecranul de admin',
                },
                manager,
            );
        });
    }
}
