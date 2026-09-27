/**
 * Where a recorded error happened — E06 S1.
 *
 * Three places, because each is repaired from a different starting point: a request names its route
 * and the account that made it, a line the server logged names the job or the service that wrote it,
 * and a screen that broke in a browser names the page.
 */
export enum ErrorSource {
    /** A request to the API answered 5xx. */
    REQUEST = 'request',
    /**
     * The server logged an error: a job, a queue, a timer — or a step of a request that failed and
     * was carried on from, which is why this is not called "background".
     */
    LOGGED = 'logged',
    /** A screen broke in the browser of someone signed in. */
    BROWSER = 'browser',
}
