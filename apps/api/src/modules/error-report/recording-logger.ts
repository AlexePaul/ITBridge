import { ConsoleLogger, Injectable } from '@nestjs/common';
import { ErrorSource } from 'src/enum/error-source.enum';
import { ErrorReportService } from './error-report.service';
import { parseLogCall } from './error-report.rules';

/**
 * Contexts whose errors are recorded elsewhere, or not at all.
 *
 * `Exception` is the HTTP filter, which records the 5xx itself with what only it knows — the request
 * id, the route, the account — and `Request` is the request logger's line about the same response,
 * which would be the same fault a second time, without its stack. `ErrorReport` is the recorder: an
 * error about recording an error, recorded, is a loop.
 */
const NOT_RECORDED = new Set(['Exception', 'Request', 'ErrorReport']);

/**
 * The application's logger: Nest's own console output, unchanged, plus every `error` and `fatal`
 * line in the error record — E06 S1.
 *
 * This is how work nobody asked for reaches the screen. Most jobs catch what they meet and say so
 * with `logger.error`; the ones that do not are caught by the scheduler, which says so with its own
 * `Logger('Scheduler')`. Either way the line passes through here, so a job added next month is
 * recorded without anybody remembering to wire it, and nothing in the jobs changed to make it so.
 *
 * Installed with `app.useLogger` in `main.ts` (and by the integration tests), which replaces the
 * instance every `new Logger(context)` forwards to — including the ones created before the call.
 */
@Injectable()
export class RecordingLogger extends ConsoleLogger {
    /** Set while a line is being handed over, so a failure inside the handover cannot come back here. */
    private recording = false;

    constructor(private readonly reports: ErrorReportService) {
        super();
    }

    error(message: unknown, ...optionalParams: unknown[]): void {
        super.error(message, ...optionalParams);
        this.capture(message, optionalParams);
    }

    fatal(message: unknown, ...optionalParams: unknown[]): void {
        super.fatal(message, ...optionalParams);
        this.capture(message, optionalParams);
    }

    private capture(message: unknown, optionalParams: unknown[]): void {
        if (this.recording) return;
        this.recording = true;
        try {
            const call = parseLogCall(message, optionalParams);
            if (call.context && NOT_RECORDED.has(call.context)) return;
            this.reports.record({
                source: ErrorSource.LOGGED,
                origin: call.context ?? '(fără context)',
                errorName: call.errorName,
                message: call.message,
                stack: call.stack,
            });
        } catch {
            // A log line is never worth an exception. The line itself has already been printed.
        } finally {
            this.recording = false;
        }
    }
}
