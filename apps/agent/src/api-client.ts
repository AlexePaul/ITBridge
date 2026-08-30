import * as fs from 'fs';
import * as path from 'path';
import type { AgentMirror, Project, UnassignedFileReason } from '@itbridge/types';
import type { AgentConfig } from './config';
import { log } from './log';

/**
 * The agent's half of the conversation with the API. E14/S2.
 *
 * **No HTTP library.** Node 22 has `fetch`, `FormData`, `Blob` and `AbortSignal.timeout` built in,
 * so the agent ships with no runtime dependencies at all beyond the shared contract — which is
 * types only and disappears at compile time. On a machine in an office that nobody logs into, every
 * dependency is something that will eventually need updating by somebody who is not there.
 *
 * **Refresh tokens rotate, and the rotation is persisted.** `POST /auth/refresh` consumes the token
 * it is given and returns its successor; presenting a consumed one is read by the server as theft
 * and revokes the whole family. A long-lived service that keeps the original in memory hits that
 * within the hour — it is the same bug `useApi.ts` had, which logged every parent out at around
 * thirty minutes. So the new token is written to disk on every refresh, before anything else uses
 * it.
 */
export interface StoredState {
    refreshToken: string | null;
}

export class ApiClient {
    private accessToken: string | null = null;
    private refreshToken: string | null = null;

    constructor(private readonly config: AgentConfig) {
        this.refreshToken = readState(config.statePath).refreshToken;
    }

    /**
     * Makes sure there is a usable access token, refreshing or signing in as needed.
     *
     * Signing in afresh is the fallback, not the plan: it is what happens on the very first run, and
     * after a refresh token has expired or been revoked. Everything else rides on the rotation.
     */
    async authenticate(): Promise<void> {
        if (this.refreshToken) {
            try {
                await this.refresh();
                return;
            } catch (error) {
                // A refresh that fails is expected occasionally — an expired token, a server that
                // revoked the family. It is not worth failing the pass over; the password login
                // below recovers, and the state file is rewritten with the new chain.
                log.warn(`Refresh failed (${message(error)}); signing in again.`);
            }
        }
        await this.login();
    }

    private async login(): Promise<void> {
        const body = (await this.request('/auth/login', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ username: this.config.username, password: this.config.password }),
            skipAuth: true,
        })) as { accessToken: string; refreshToken: string };

        this.accessToken = body.accessToken;
        this.setRefreshToken(body.refreshToken);
    }

    private async refresh(): Promise<void> {
        const body = (await this.request('/auth/refresh', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ refreshToken: this.refreshToken }),
            skipAuth: true,
        })) as { accessToken: string; refreshToken: string };

        this.accessToken = body.accessToken;
        // Written to disk before it is used for anything. A crash between "the server rotated it"
        // and "we wrote it down" would otherwise leave the agent holding a token the server has
        // already consumed, and the next attempt would look like a replay.
        this.setRefreshToken(body.refreshToken);
    }

    private setRefreshToken(token: string): void {
        this.refreshToken = token;
        writeState(this.config.statePath, { refreshToken: token });
    }

    /** The folder tree to mirror onto the share. */
    async mirror(): Promise<AgentMirror> {
        return (await this.request('/agent/mirror', { method: 'GET' })) as AgentMirror;
    }

    /** Says the agent is alive, and how the last pass went. */
    async heartbeat(payload: { pendingFiles: number; lastError: string | null; version: string }): Promise<void> {
        await this.request('/agent/heartbeat', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({
                agentName: this.config.name,
                watchedRoot: this.config.root,
                version: payload.version,
                pendingFiles: payload.pendingFiles,
                lastError: payload.lastError ?? undefined,
            }),
        });
    }

    /**
     * Uploads one file.
     *
     * The hash travels with it so the server can refuse a mismatch, but the server recomputes it —
     * it is what makes the upload idempotent, and a value the client could choose freely would let a
     * mistaken agent collide with somebody else's.
     */
    async ingest(input: {
        childId: number;
        capturedOn: string;
        contentHash: string;
        fileName: string;
        bytes: Buffer;
        title?: string;
    }): Promise<Project> {
        const form = new FormData();
        form.append('childId', String(input.childId));
        form.append('capturedOn', input.capturedOn);
        form.append('contentHash', input.contentHash);
        if (input.title) form.append('title', input.title);
        form.append('file', new Blob([new Uint8Array(input.bytes)]), input.fileName);

        return (await this.request('/projects/ingest', { method: 'POST', body: form })) as Project;
    }

    /** A project that is a link rather than a file — a `.url` or `.txt` left in a child's folder. */
    async createLinkProject(input: {
        childId: number;
        capturedOn: string;
        title: string;
        label: string;
        url: string;
    }): Promise<Project> {
        return (await this.request('/projects', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({
                childId: input.childId,
                capturedOn: input.capturedOn,
                title: input.title,
                links: [{ label: input.label, url: input.url }],
            }),
        })) as Project;
    }

    /**
     * Says a file could not be placed. E14/S2: nothing is lost in silence.
     *
     * Idempotent on the server, keyed on the path, so an agent restarted three times in an afternoon
     * does not file the same stray three times.
     */
    async reportUnassigned(input: {
        groupId?: number;
        relativePath: string;
        fileName: string;
        sizeBytes: number;
        reason: UnassignedFileReason;
    }): Promise<void> {
        await this.request('/agent/unassigned', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify(input),
        });
    }

    /**
     * One request, with one retry after re-authenticating on a 401.
     *
     * The retry is deliberately shallow: exactly one, and only for 401. Anything deeper turns a
     * server that is refusing us into a loop that hammers it, and the agent has nowhere to be — the
     * next pass is thirty seconds away and the file is still in the folder.
     */
    private async request(pathname: string, init: RequestInit & { skipAuth?: boolean }): Promise<unknown> {
        const { skipAuth, ...rest } = init;

        const send = async (): Promise<Response> =>
            fetch(`${this.config.apiBase}${pathname}`, {
                ...rest,
                headers: {
                    ...(rest.headers as Record<string, string> | undefined),
                    ...(skipAuth || !this.accessToken ? {} : { authorization: `Bearer ${this.accessToken}` }),
                },
                // Generous, because an upload of twenty megabytes over a school connection is not
                // fast — but finite, because a request that never answers would stall the pass.
                signal: AbortSignal.timeout(120_000),
            });

        let response = await send();

        if (response.status === 401 && !skipAuth) {
            await this.authenticate();
            response = await send();
        }

        if (!response.ok) {
            const detail = await response.text().catch(() => '');
            throw new HttpError(response.status, `${pathname} answered ${response.status}: ${detail.slice(0, 300)}`);
        }

        // 204, and any empty body, is a perfectly good answer to a heartbeat.
        const text = await response.text();
        return text ? (JSON.parse(text) as unknown) : null;
    }
}

export class HttpError extends Error {
    constructor(
        readonly status: number,
        message: string,
    ) {
        super(message);
        this.name = 'HttpError';
    }
}

/**
 * The state file holds one thing: the current refresh token.
 *
 * A missing or corrupt file is not an error — it means "sign in with the password", which is exactly
 * what the first run does. Throwing here would make a stray text editor able to stop the agent from
 * ever starting again.
 */
function readState(statePath: string): StoredState {
    try {
        return JSON.parse(fs.readFileSync(statePath, 'utf8')) as StoredState;
    } catch {
        return { refreshToken: null };
    }
}

function writeState(statePath: string, state: StoredState): void {
    fs.mkdirSync(path.dirname(statePath), { recursive: true });
    // Written to a temporary file and renamed, because a machine that loses power mid-write would
    // otherwise leave a half-written token — and a half-written token is indistinguishable from a
    // stolen one as far as the server's replay detection is concerned.
    const temporary = `${statePath}.tmp`;
    fs.writeFileSync(temporary, JSON.stringify(state), { mode: 0o600 });
    fs.renameSync(temporary, statePath);
}

function message(error: unknown): string {
    return error instanceof Error ? error.message : String(error);
}
