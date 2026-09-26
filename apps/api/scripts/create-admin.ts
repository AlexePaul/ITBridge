import '../src/load-env';
import * as readline from 'readline';
import { DataSource } from 'typeorm';
import { dataSourceOptions } from '../src/data-source';
import { ADMIN_MIN_PASSWORD_LENGTH, adminAccountProblems, createOrResetAdmin } from '../src/modules/user/admin-account';

/**
 * The school's admin accounts, from a terminal on the backend's host — `admin-account.ts` says why.
 *
 *     pnpm --filter api admin:create --username secretariat
 *     pnpm --filter api admin:create --username secretariat --reset-password
 *
 * The password is asked for twice, without echo. Where there is no terminal to ask in, it is read
 * from `ADMIN_PASSWORD` — never from the command line, where it would stay in the shell's history
 * and in `ps` for as long as the command runs. Nothing it prints contains the password.
 *
 * It writes to the database `DB_*` names, like every other command here; on the instance that is
 * `/etc/itbridge/<env>.env`. It deletes nothing.
 */

function argument(name: string): string | undefined {
    const index = process.argv.indexOf(name);
    if (index === -1) return undefined;
    const next = process.argv[index + 1];
    return next && !next.startsWith('--') ? next : '';
}

/** One line from the terminal; with `hidden`, only the question is shown — never what is typed. */
function ask(question: string, hidden: boolean): Promise<string> {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout, terminal: true });
    if (hidden) {
        const output = rl as unknown as { _writeToOutput: (text: string) => void };
        output._writeToOutput = (text: string) => {
            if (text.includes(question)) process.stdout.write(question);
        };
    }
    return new Promise((resolve) => {
        rl.question(question, (answer) => {
            rl.close();
            if (hidden) process.stdout.write('\n');
            resolve(answer);
        });
    });
}

async function passwordFor(): Promise<{ password: string; confirmation?: string }> {
    const fromEnv = process.env.ADMIN_PASSWORD;
    if (fromEnv) return { password: fromEnv };
    if (!process.stdin.isTTY) {
        throw new Error('No terminal to ask for the password in: set ADMIN_PASSWORD for this one command, or run it in a terminal.');
    }
    const password = await ask(`Parola (cel puțin ${ADMIN_MIN_PASSWORD_LENGTH} caractere): `, true);
    const confirmation = await ask('Parola, încă o dată: ', true);
    return { password, confirmation };
}

async function main(): Promise<void> {
    const username = (argument('--username') ?? '').trim();
    const reset = process.argv.includes('--reset-password');
    if (!username) throw new Error('Usage: admin:create --username <name> [--reset-password]');

    const { password, confirmation } = await passwordFor();
    const problems = adminAccountProblems({ username, password, confirmation });
    if (problems.length > 0) throw new Error(problems.join(' '));

    const dataSource = new DataSource({ ...dataSourceOptions, logging: false });
    await dataSource.initialize();
    try {
        const result = await createOrResetAdmin(dataSource, { username, password, reset });
        const site = (process.env.SITE_URL?.trim() || 'https://itbridgeschool.com').replace(/\/+$/, '');
        console.log(
            result.created
                ? `Admin account "${username}" created (id ${result.userId}). Sign in at ${site}/auth/login.`
                : `New password set for admin "${username}" (id ${result.userId}); every session of the account was closed.`,
        );
    } finally {
        await dataSource.destroy();
    }
}

main().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
});
