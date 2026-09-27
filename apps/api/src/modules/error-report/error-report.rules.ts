import { createHash } from 'crypto';
import { ErrorSource } from 'src/enum/error-source.enum';
import { ErrorOccurrence } from 'src/entities/error-report.entity';
import { redactUrl } from 'src/common/redact-url';

/**
 * The pure half of the error record — E06 S1: what is kept of an error, and when two errors are the
 * same fault.
 */

/** How many occurrences a row keeps. Enough to see a pattern — the same family, the same hour. */
export const RECENT_OCCURRENCES = 20;

export const MESSAGE_MAX_LENGTH = 1000;
export const STACK_MAX_LENGTH = 8000;
export const ORIGIN_MAX_LENGTH = 300;
export const NAME_MAX_LENGTH = 100;
export const PATH_MAX_LENGTH = 500;

/**
 * Takes out of a message or a stack what could be a person's: addresses, phone numbers, IBANs,
 * tokens, and the values Postgres quotes back in a constraint error.
 *
 * The school's own messages name families by id, never by name, so ids stay — they are what a fix
 * starts from. What this guards against is the text nobody here wrote: the driver's
 * `Key (email)=(ana@example.com) already exists`, a library echoing the value it choked on.
 */
export function scrub(text: string): string {
    return (
        text
            // Postgres detail: `Key (email)=(ana@example.com)`. The column is the useful half.
            .replace(/\)=\([^)]*\)/g, ')=(…)')
            // Bearer tokens and JWTs.
            .replace(/\beyJ[\w-]+\.[\w-]+\.[\w-]+/g, '[token]')
            .replace(/\b(bearer)\s+[\w.~+/-]+=*/gi, '$1 [token]')
            // `token=…`, `password: …` in a URL or a serialised object.
            .replace(/\b(password|passwd|token|secret|apikey|api_key)(["']?\s*[:=]\s*["']?)[^\s"'&,}]+/gi, '$1$2[redacted]')
            .replace(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g, '[email]')
            // An IBAN before the phone numbers: its digits would otherwise be read as one.
            .replace(/\b[A-Z]{2}\d{2}(?:\s?[A-Z0-9]{4}){3,7}(?:\s?[A-Z0-9]{1,3})?\b/g, '[iban]')
            // Romanian numbers as people type them: 0712 345 678, +40 712-345-678, 021 123 4567.
            .replace(/(?<![\w.:])(?:\+?40|0)\s?[237]\d{1,2}[\s.-]?\d{3}[\s.-]?\d{3,4}(?![\w.])/g, '[telefon]')
            // Long opaque strings — the platform's link tokens are 64 hex characters.
            .replace(/\b[a-f0-9]{32,}\b/gi, '[token]')
    );
}

/** Cuts a text to a column's length, saying so. */
export function clip(text: string, max: number): string {
    return text.length <= max ? text : `${text.slice(0, max - 1)}…`;
}

/**
 * The message with what changes between two occurrences of one fault taken out: numbers, ids,
 * quoted values. `Could not erase family 12` and `Could not erase family 40` are one fault.
 */
export function normaliseMessage(message: string): string {
    return message
        .replace(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi, '<uuid>')
        .replace(/"[^"]*"|'[^']*'|`[^`]*`/g, '<value>')
        .replace(/\d+/g, '#')
        .replace(/\s+/g, ' ')
        .trim();
}

/**
 * The first frame of a stack that says where the error was thrown, without its line and column:
 * those move with every deploy, and a fault does not become a new one because a comment was added
 * above it.
 */
export function throwSite(stack: string | null): string {
    if (!stack) return '';
    const frame = stack.split('\n').find((line) => /^\s+at\s/.test(line));
    if (!frame) return '';
    return frame
        .trim()
        .replace(/:\d+:\d+\)?$/, '')
        .replace(/\s*\(/, ' ');
}

/** What makes two occurrences the same fault. Hex SHA-256, the column's 64 characters. */
export function fingerprint(input: { source: ErrorSource; origin: string; errorName: string; message: string; stack: string | null }): string {
    const key = [input.source, input.origin, input.errorName, normaliseMessage(input.message), throwSite(input.stack)].join('\n');
    return createHash('sha256').update(key).digest('hex');
}

/**
 * The route an admin can find the fault under: Express's pattern (`/profiles/:id`) when a handler
 * was matched, the path with its numbers folded otherwise. Never the address itself — `/profiles/12`
 * and `/profiles/40` are one fault, and a query string can carry an address.
 */
export function routeOf(request: { method: string; route?: { path?: unknown }; baseUrl?: string; path?: string; url: string }): string {
    const pattern = typeof request.route?.path === 'string' ? `${request.baseUrl ?? ''}${request.route.path}` : null;
    // No handler matched: the fault is in front of every route, and the path is whatever the caller
    // typed — one row per invented path is how the screen fills with noise (review of 27 September).
    return clip(`${request.method} ${pattern ?? UNMATCHED_ROUTE}`, ORIGIN_MAX_LENGTH);
}

/** The origin of a fault raised before any route matched. */
export const UNMATCHED_ROUTE = '(nicio rută)';

/** An address as it is kept on an occurrence: redacted like a log line, cut to the column. */
export function occurrencePath(path: string | null | undefined): string | null {
    if (!path) return null;
    return clip(scrub(redactUrl(path)), PATH_MAX_LENGTH);
}

/** The newest occurrence first, then as many older ones as the row keeps. */
export function withOccurrence(recent: ErrorOccurrence[], occurrence: ErrorOccurrence): ErrorOccurrence[] {
    return [occurrence, ...recent].slice(0, RECENT_OCCURRENCES);
}

/**
 * A logger call, the way Nest hands it to the application's logger.
 *
 * `new Logger('Ctx').error(…)` arrives as `(message, stack?, 'Ctx')`, the scheduler's catch as
 * `(error, undefined, 'Scheduler')`, and a service passing the error object itself as
 * `(error, undefined, 'Ctx')`. Whichever it was, what comes out is the name, the message, the stack
 * when there was one, and the context.
 */
export function parseLogCall(message: unknown, params: unknown[]): { context: string | null; errorName: string; message: string; stack: string | null } {
    const rest = [...params];
    let context: string | null = null;
    const last = rest[rest.length - 1];
    if (typeof last === 'string' && !looksLikeStack(last)) {
        context = last;
        rest.pop();
    }
    const stackParam = rest.find((param): param is string => typeof param === 'string' && looksLikeStack(param)) ?? null;
    const errorParam = rest.find((param): param is Error => param instanceof Error) ?? null;

    if (message instanceof Error) {
        return { context, errorName: message.name, message: message.message, stack: message.stack ?? stackParam };
    }
    const text = typeof message === 'string' ? message : safeStringify(message);
    const detail = errorParam ? `${text}: ${errorParam.message}` : text;
    return { context, errorName: errorParam?.name ?? 'Error', message: detail, stack: stackParam ?? errorParam?.stack ?? null };
}

function looksLikeStack(text: string): boolean {
    return /\n\s+at\s/.test(text);
}

function safeStringify(value: unknown): string {
    try {
        return JSON.stringify(value) ?? String(value);
    } catch {
        return String(value);
    }
}
