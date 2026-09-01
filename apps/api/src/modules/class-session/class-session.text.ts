import { ClassSession } from 'src/entities/class-session.entity';

/**
 * How a class session is named to a person, in one line.
 *
 * It lived inside `unmarked-attendance.job.ts` while that job was the only thing that had to write
 * a session down. E12/S7's fifteen-minute alert is the second, and it names a session for exactly
 * the same reason — so that whoever reads it knows which door to knock on. Extracted rather than
 * copied, for the reason `office-address.ts` was extracted: the second caller would otherwise have
 * had to import from the first job, which says nothing true about either of them.
 *
 * Romanian, like everything a person at the school reads.
 */

/** "Scratch Începători, 16:00-17:30, Sala 1 (Drumul Taberei)" — what someone needs to go and ask. */
export function describeSession(session: ClassSession): string {
    const hours = `${formatTime(session.startTime)}-${formatTime(session.endTime)}`;
    // `findUnmarkedSessions` joins the room and its location, so both are here. Guarded anyway:
    // a reminder that throws while formatting is a reminder nobody gets.
    const room = session.room?.name ?? 'sală necunoscută';
    const location = session.room?.location?.name;
    const where = location === undefined ? room : `${room} (${location})`;
    return `${session.group?.name ?? 'grupă necunoscută'}, ${hours}, ${where}`;
}

/** A `time` column arrives as `16:00:00`; nobody needs the seconds. */
export function formatTime(value: string): string {
    return value.slice(0, 5);
}
