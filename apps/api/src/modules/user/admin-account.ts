import * as bcrypt from 'bcrypt';
import { DataSource, IsNull } from 'typeorm';
import { User } from 'src/entities/user.entity';
import { ApprovalStatus } from 'src/enum/approval-status.enum';
import { Session } from 'src/entities/session.entity';
import { AuditLog } from 'src/entities/audit-log.entity';
import { AuditAction } from 'src/enum/audit-action.enum';
import { Role } from 'src/enum/role.enum';

/**
 * The school's admin accounts from the command line — `pnpm --filter api admin:create`.
 *
 * Production has no seed (it truncates every table, and `checkSeedTarget` refuses a production
 * backend outright), so the first admin needs another door, and one that writes one row and
 * deletes nothing. It is also the only way back in for an admin who forgot the password: `forgot-
 * password` finds an account by the email on its family's profile, and an admin has no profile.
 *
 * Longer passwords than a parent's minimum (`MIN_PASSWORD_LENGTH`, 6): an admin account reads every
 * family in the school.
 */
export const ADMIN_MIN_PASSWORD_LENGTH = 12;

export interface AdminAccountInput {
    username: string;
    password: string;
    /** Set a new password on an existing admin account instead of creating one. */
    reset: boolean;
}

export type AdminAccountResult = { userId: number; created: boolean };

/** What is wrong with the input, in English — it is a developer's command, not a family's screen. */
export function adminAccountProblems(input: { username: string; password: string; confirmation?: string }): string[] {
    const problems: string[] = [];
    const username = input.username.trim();
    if (username.length < 1 || username.length > 30) problems.push('The username must be between 1 and 30 characters.');
    if (/\s/.test(username)) problems.push('The username cannot contain spaces.');
    if (input.password.length < ADMIN_MIN_PASSWORD_LENGTH) {
        problems.push(`An admin password must be at least ${ADMIN_MIN_PASSWORD_LENGTH} characters.`);
    }
    if (input.confirmation !== undefined && input.confirmation !== input.password) problems.push('The two passwords differ.');
    return problems;
}

/**
 * Creates the admin account, or sets a new password on one, in one transaction with its trail.
 *
 * Refused: a username already taken when not resetting, and a reset aimed at an account that is not
 * an admin's — a parent's password is theirs to change, through the link, never from a terminal.
 * A reset closes every session of the account, like every other password change (CLAUDE.md, the
 * password reset rules), behind the account row as `SessionService.revokeAllForUser` does.
 */
export async function createOrResetAdmin(dataSource: DataSource, input: AdminAccountInput, now: Date = new Date()): Promise<AdminAccountResult> {
    const problems = adminAccountProblems(input);
    if (problems.length > 0) throw new Error(problems.join(' '));
    const username = input.username.trim();
    const passwordHash = await bcrypt.hash(input.password, 10);

    return dataSource.transaction(async (manager) => {
        const existing = await manager.findOne(User, { where: { username }, lock: { mode: 'pessimistic_write' } });

        if (!input.reset) {
            if (existing) throw new Error(`An account named "${username}" already exists. Use --reset-password to set a new password on an admin account.`);
            const created = await manager.save(User, {
                username,
                passwordHash,
                role: Role.ADMIN,
                // Both gates written as open: `isAccountActive` exempts admins anyway, and a row that
                // says what is true beats column defaults implying an admin awaits approval.
                emailConfirmedAt: now,
                approvalStatus: ApprovalStatus.APPROVED,
                approvalDecidedAt: now,
            });
            await trail(manager, created.id, AuditAction.CREATED, ['user', 'role'], 'cont de admin creat din linia de comandă (admin:create)');
            return { userId: created.id, created: true };
        }

        if (!existing) throw new Error(`No account named "${username}" to reset.`);
        if (existing.role !== Role.ADMIN) throw new Error(`"${username}" is not an admin account; a parent changes their own password.`);
        await manager.update(User, existing.id, { passwordHash });
        await manager.update(Session, { user: { id: existing.id }, revokedAt: IsNull() }, { revokedAt: now });
        await trail(manager, existing.id, AuditAction.UPDATED, ['password'], 'parola de admin schimbată din linia de comandă (admin:create)');
        return { userId: existing.id, created: false };
    });
}

/** Field names only, like every trail about an account (E07/S3); the actor is nobody signed in. */
async function trail(manager: DataSource['manager'], userId: number, action: AuditAction, fields: string[], note: string): Promise<void> {
    await manager.insert(AuditLog, {
        actorUserId: null,
        actorUsername: null,
        action,
        entityType: 'User',
        entityId: userId,
        changes: Object.fromEntries(fields.map((field) => [field, { from: null, to: null }])),
        note,
    });
}
