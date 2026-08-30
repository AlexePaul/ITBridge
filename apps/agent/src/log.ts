/**
 * The agent's log: one line, one fact, to stdout.
 *
 * Nothing structured, and no file of its own. A Windows service run through NSSM already captures
 * stdout and stderr into files it rotates, so writing a second log here would mean two places to
 * look and one of them filling a disk in an office nobody visits.
 *
 * **A child's name never appears in a log line.** The share is organised by name and the agent knows
 * every one of them, so this is easy to get wrong by accident: paths are logged relative to the
 * watched root only when a file could not be placed, which is exactly the case where somebody has to
 * go and look at it.
 */
function stamp(): string {
    return new Date().toISOString();
}

export const log = {
    info(message: string): void {
        console.log(`${stamp()} INFO  ${message}`);
    },
    warn(message: string): void {
        console.warn(`${stamp()} WARN  ${message}`);
    },
    error(message: string): void {
        console.error(`${stamp()} ERROR ${message}`);
    },
};
