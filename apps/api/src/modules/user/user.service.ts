import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import { User } from 'src/entities/user.entity';
import { DataSource, Not, Repository } from 'typeorm';
import { UpdateUserDto } from './dto/updateUser.dto';
import { AuditAction } from 'src/enum/audit-action.enum';
import { AuditService, type Actor } from 'src/modules/audit/audit.service';

/**
 * The two things an edit to an account can move, and therefore the only two the trail can name.
 *
 * `username` and `role` are both classified personal with `account` retention in the data
 * inventory (E07 S1), so the trail takes the **field names and not the values** — the rule E07 S3
 * draws for `Profile` and `Child`, applied to the third table that describes a person. The value a
 * role became is on the row, which is where a reader should look for it; what the row cannot say is
 * who moved it.
 */
const EDITABLE_ACCOUNT_FIELDS = ['username', 'role'] as const;

@Injectable()
export class UserService {
    constructor(
        @InjectRepository(User)
        private userRepository: Repository<User>,
        @InjectDataSource() private readonly dataSource: DataSource,
        private readonly audit: AuditService,
    ) {}

    async getAllUsers(): Promise<User[]> {
        return this.userRepository.find();
    }

    /**
     * Accounts that have no profile attached yet — the other half of the flow where an admin creates
     * a profile without an account and links the two later.
     *
     * This used to use `NOT IN` over a subquery selecting `profile.user_id`. That column is nullable,
     * and in SQL `x NOT IN (1, 2, NULL)` evaluates to NULL rather than true, so the moment a single
     * profile existed without an account the endpoint returned an empty list — always, and silently.
     * `NOT EXISTS` has no such behaviour with NULLs.
     */
    async getUsersWithoutProfile(): Promise<User[]> {
        return this.userRepository
            .createQueryBuilder('user')
            .where((qb) => {
                const subQuery = qb.subQuery().select('1').from('profiles', 'profile').where('profile.user_id = user.id').getQuery();
                return `NOT EXISTS ${subQuery}`;
            })
            .getMany();
    }

    async getUserById(id: number): Promise<User> {
        const user = await this.userRepository.findOne({ where: { id } });

        if (!user) {
            throw new NotFoundException('User not found');
        }

        return user;
    }

    /**
     * Edits an account — and this is the route that **grants ADMIN**.
     *
     * `UpdateUserDto.role` is the single write in the platform that hands somebody every family's
     * data, and until now it left nothing behind: `approvalDecidedAt` records when a family was let
     * in but not by whom, and a promotion recorded neither. E07 S3 covered the money and the
     * personal data; access fell between the two, so "who made account 12 an admin" had no answer
     * anywhere in the system.
     *
     * The trail goes in the same transaction as the change, as every trail must since it started
     * demanding a manager, and it names the fields rather than their values — see
     * `EDITABLE_ACCOUNT_FIELDS`.
     */
    async updateUser(id: number, updateUserDto: UpdateUserDto, actor: Actor): Promise<User> {
        const existing = await this.userRepository.findOne({ where: { id } });
        if (!existing) {
            throw new NotFoundException('User not found');
        }

        if (updateUserDto.username) {
            // `Not(id)`: without it the row being edited was its own collision, so re-sending the
            // username a form had prefilled — which is every save that only meant to change the
            // role — answered 409 „Username already in use" about the account's own name.
            // `ProfileService` guards its e-mail check the same way.
            const clash = await this.userRepository.findOne({
                where: { username: updateUserDto.username, id: Not(id) },
            });

            if (clash) throw new ConflictException('Username already in use');
        }

        // Which fields actually move, read before the merge: comparing after it would compare the
        // row with itself and record an edit that changed nothing.
        const moved = EDITABLE_ACCOUNT_FIELDS.filter((field) => updateUserDto[field] !== undefined && updateUserDto[field] !== existing[field]);

        return this.dataSource.transaction(async (manager) => {
            await manager.update(User, id, updateUserDto);

            await this.audit.recordPersonalDataChange(
                {
                    actor,
                    action: AuditAction.UPDATED,
                    entityType: 'User',
                    entityId: id,
                    fields: moved,
                    note: moved.includes('role') ? 'rol schimbat' : 'cont editat',
                },
                manager,
            );

            const updatedUser = await manager.findOne(User, { where: { id } });
            if (!updatedUser) {
                throw new NotFoundException('User not found after update');
            }

            return updatedUser;
        });
    }

    /**
     * Removes an account. The family's `Profile` survives it — `profiles.user_id` is nullable — so
     * this is closing a way in, not erasing anybody; that is E07 S4.
     *
     * The trail is written in the same transaction, and it matters more here than anywhere else on
     * this service: after the row is gone it is the only thing that can say who removed the account,
     * and the sessions, confirmations and acceptances that cascade away with it leave no reader
     * behind either.
     */
    async deleteUser(id: number, actor: Actor) {
        return this.dataSource.transaction(async (manager) => {
            const deleteResult = await manager.delete(User, id);

            if (deleteResult.affected === 0) {
                throw new NotFoundException('User not found');
            }

            await this.audit.recordPersonalDataChange(
                {
                    actor,
                    action: AuditAction.DELETED,
                    entityType: 'User',
                    entityId: id,
                    fields: ['user'],
                    note: 'cont șters',
                },
                manager,
            );

            return { message: 'User deleted successfully' };
        });
    }
}
