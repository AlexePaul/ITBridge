/** A probe that waits forever is worse than one that says "not ready" — see `withTimeout`. */
export const CHECK_TIMEOUT_MS = 2_000;

/**
 * Fails a check that does not answer in time, instead of waiting on it.
 *
 * A stopped database refuses the connection and fails in milliseconds, which is the easy case. A
 * *hung* one — paused container, saturated pool, network black hole — accepts the socket and never
 * replies, and `SELECT 1` has no timeout of its own, so `/ready` used to hang indefinitely rather
 * than report unhealthy. Verified: with the database process paused, the endpoint returned nothing
 * at all after twenty seconds. A readiness probe has to fail fast or it is not a probe.
 */
export async function withTimeout<T>(work: Promise<T>, label: string): Promise<T> {
    let timer: NodeJS.Timeout | undefined;
    try {
        return await Promise.race([
            work,
            new Promise<never>((_resolve, reject) => {
                timer = setTimeout(() => reject(new Error(`${label} check timed out after ${CHECK_TIMEOUT_MS}ms`)), CHECK_TIMEOUT_MS);
            }),
        ]);
    } finally {
        if (timer) clearTimeout(timer);
    }
}
