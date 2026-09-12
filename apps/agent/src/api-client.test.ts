import { strict as assert } from 'assert';
import * as fs from 'fs';
import * as http from 'http';
import * as os from 'os';
import * as path from 'path';
import { describe, it } from 'node:test';
import { ApiClient } from './api-client';
import type { AgentConfig } from './config';

/**
 * The agent's half of the token dance, against a server that behaves like the real one.
 *
 * A real HTTP server rather than a stubbed `fetch`, because the thing under test is what happens
 * when two requests are in flight at once — and a stub that hands back a ready-made answer returns
 * control too early for them to genuinely overlap.
 *
 * The server here is deliberately as unforgiving as `SessionService.rotate`: presenting a refresh
 * token that has already been rotated is not a soft error, it revokes the whole family. That is the
 * rule the agent used to trip over roughly four times an hour.
 */

interface Recording {
    refreshCalls: number;
    loginCalls: number;
    replayDetected: boolean;
    /** Set to make every authenticated request answer 401 until the next rotation. */
    accessTokenExpired: boolean;
    /** Milliseconds `/agent/mirror` sits on its answer, so two requests can be made to overlap. */
    mirrorDelayMs: number;
}

async function withServer(
    run: (client: ApiClient, recording: Recording, config: AgentConfig) => Promise<void>,
): Promise<void> {
    const recording: Recording = {
        refreshCalls: 0,
        loginCalls: 0,
        replayDetected: false,
        accessTokenExpired: true,
        mirrorDelayMs: 0,
    };

    let liveRefreshToken = 'refresh-0';
    let familyRevoked = false;
    let issued = 0;

    const server = http.createServer((req, res) => {
        let body = '';
        req.on('data', (chunk) => (body += chunk));
        req.on('end', () => {
            const json = (status: number, payload: unknown) => {
                res.writeHead(status, { 'content-type': 'application/json' });
                res.end(JSON.stringify(payload));
            };

            if (req.url === '/auth/login') {
                recording.loginCalls += 1;
                familyRevoked = false;
                liveRefreshToken = `refresh-login-${++issued}`;
                recording.accessTokenExpired = false;
                return json(200, { accessToken: `access-${issued}`, refreshToken: liveRefreshToken });
            }

            if (req.url === '/auth/refresh') {
                recording.refreshCalls += 1;
                const presented = (JSON.parse(body || '{}') as { refreshToken?: string }).refreshToken;
                if (familyRevoked || presented !== liveRefreshToken) {
                    // What the real server does with a token it has already consumed: read it as
                    // two parties holding one chain, and revoke everything in it.
                    recording.replayDetected = true;
                    familyRevoked = true;
                    return json(401, { message: 'Invalid refresh token' });
                }
                liveRefreshToken = `refresh-${++issued}`;
                recording.accessTokenExpired = false;
                return json(200, { accessToken: `access-${issued}`, refreshToken: liveRefreshToken });
            }

            if (req.url === '/agent/mirror') {
                const expired = recording.accessTokenExpired;
                const answer = () => (expired ? json(401, { message: 'Unauthorized' }) : json(200, { locations: [] }));
                if (recording.mirrorDelayMs > 0) setTimeout(answer, recording.mirrorDelayMs);
                else answer();
                return;
            }
            if (recording.accessTokenExpired) return json(401, { message: 'Unauthorized' });
            return json(200, {});
        });
    });

    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    const address = server.address();
    const port = typeof address === 'object' && address ? address.port : 0;

    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'itbridge-agent-api-'));
    const stateFile = path.join(dir, 'state.json');
    fs.writeFileSync(stateFile, JSON.stringify({ refreshToken: 'refresh-0' }));

    const config: AgentConfig = {
        apiBase: `http://127.0.0.1:${port}`,
        username: 'agent',
        password: 'secret',
        root: dir,
        name: 'test',
        scanIntervalMs: 30_000,
        mirrorIntervalMs: 900_000,
        heartbeatIntervalMs: 300_000,
        statePath: stateFile,
        quietPeriodMs: 20_000,
    };

    try {
        await run(new ApiClient(config), recording, config);
    } finally {
        await new Promise<void>((resolve) => server.close(() => resolve()));
        fs.rmSync(dir, { recursive: true, force: true });
    }
}

const beat = (client: ApiClient) => client.heartbeat({ pendingFiles: 0, lastError: null, version: '0.1.0' });

describe('ApiClient', () => {
    it('refreshes once when two calls hit an expired access token together', async () => {
        // The bug this exists for. Three timers run over one client — scan every thirty seconds,
        // heartbeat every five minutes, mirror every fifteen — and the access token lasts a quarter
        // of an hour. Those divide into each other, so a tick where two of them fire on an expired
        // token is not a rare interleaving, it is the schedule. Both used to refresh with the same
        // token and the loser was read as theft.
        await withServer(async (client, recording) => {
            await Promise.all([client.mirror(), beat(client)]);

            assert.equal(recording.refreshCalls, 1, 'the two calls should share one rotation');
            assert.equal(recording.replayDetected, false, 'the server must not see a replay');
            assert.equal(recording.loginCalls, 0, 'and nothing should have had to fall back to the password');
        });
    });

    it('does not rotate again for a 401 that arrived after somebody else had fixed it', async () => {
        // The near miss the shared promise alone does not cover. A request that set off with the
        // old token can come back 401 *after* another has already rotated and settled — there is no
        // promise left to join, so without the generation counter it would ask for a rotation of its
        // own. Not a replay, so no alarm; just a second session chain every quarter of an hour, for
        // a token that was already waiting in the field next to it.
        await withServer(async (client, recording) => {
            recording.mirrorDelayMs = 250;
            const slow = client.mirror();
            await beat(client);

            // Asserted here, before the slow call comes back, because the ordering *is* the test:
            // without it this would pass by simply reproducing the case above. 250ms is a hundred
            // times what three round trips to localhost cost, so the order is not a race.
            assert.equal(recording.refreshCalls, 1, 'the quick call should have rotated already');
            await slow;

            assert.equal(recording.refreshCalls, 1, 'and the slow one should have taken the token it left');
            assert.equal(recording.replayDetected, false);
        });
    });

    it('still refreshes again the next time the token expires', async () => {
        // The other half: the shared promise has to be let go of once it settles. Held on to, the
        // next expiry would join a promise that resolved long ago — so nothing would be refreshed
        // at all, and the retry would carry the same expired token it just failed with.
        await withServer(async (client, recording) => {
            await client.mirror();
            recording.accessTokenExpired = true;
            await client.mirror();

            assert.equal(recording.refreshCalls, 2);
            assert.equal(recording.replayDetected, false);
        });
    });

    it('writes the rotated refresh token to disk, so a restart does not replay the old one', async () => {
        await withServer(async (client, _recording, config) => {
            await client.mirror();

            const stored = JSON.parse(fs.readFileSync(config.statePath, 'utf8')) as { refreshToken: string };
            assert.notEqual(stored.refreshToken, 'refresh-0');
        });
    });

    it('signs in with the password when the stored refresh token is no longer good', async () => {
        await withServer(async (_client, recording, config) => {
            fs.writeFileSync(config.statePath, JSON.stringify({ refreshToken: 'a-token-the-server-never-issued' }));
            // A second client, so that it reads the state file as it now stands.
            await new ApiClient(config).mirror();

            assert.equal(recording.loginCalls, 1);
            // The replay the server saw is the *stored* token, not one this agent rotated away —
            // which is the case the password login exists for.
            assert.equal(recording.refreshCalls, 1);
        });
    });
});
