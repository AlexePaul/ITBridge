import { ArgumentsHost } from '@nestjs/common';
import { QueryFailedError } from 'typeorm';
import { AllExceptionsFilter } from './all-exceptions.filter';
import { ErrorReportService } from 'src/modules/error-report/error-report.service';

/** What a route that skipped its DTO hands the driver, and what the driver answers. */
function driverError(code: string): QueryFailedError {
    const error = new QueryFailedError('SELECT $1::date', ['2026-02-30'], new Error('date/time field value out of range: "2026-02-30"'));
    Object.assign(error, { code });
    return error;
}

describe('AllExceptionsFilter', () => {
    const answer = (exception: unknown) => {
        const record = jest.fn();
        const json = jest.fn();
        const status = jest.fn().mockReturnValue({ json });
        const host = {
            switchToHttp: () => ({
                getResponse: () => ({ status }),
                getRequest: () => ({ method: 'GET', url: '/x?from=2026-02-30', originalUrl: '/x?from=2026-02-30', requestId: 'abc' }),
            }),
        } as unknown as ArgumentsHost;

        new AllExceptionsFilter({ record } as unknown as ErrorReportService).catch(exception, host);

        return { statusCode: status.mock.calls[0][0] as number, body: json.mock.calls[0][0] as { code: string }, recorded: record.mock.calls.length };
    };

    /**
     * QA of 27 September 2026: a day that does not exist reached Postgres through a route reading a
     * bare query value, and came back a 500 on the error screen. It is the caller's value.
     */
    it.each(['22007', '22008'])('answers a date Postgres cannot read (%s) with a 400, recorded nowhere', (code) => {
        const { statusCode, body, recorded } = answer(driverError(code));

        expect(statusCode).toBe(400);
        expect(body.code).toBe('INVALID_DATE');
        expect(recorded).toBe(0);
    });

    it('still answers a database fault it does not know with a 500, and records it', () => {
        const { statusCode, body, recorded } = answer(driverError('XX000'));

        expect(statusCode).toBe(500);
        expect(body.code).toBe('DATABASE_ERROR');
        expect(recorded).toBe(1);
    });
});
