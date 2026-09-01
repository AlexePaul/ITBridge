import { Test, TestingModule } from '@nestjs/testing';
import { ArrearsJob, DEDUPE_PREFIX, NOTICE_DAYS_BEFORE, REMINDER_INTERVAL_DAYS, STOP_WRITING_AFTER_DAYS } from './arrears.job';
import { ArrearsService, ArrearsRow } from './arrears.service';
import { OutboxService } from 'src/modules/mail/outbox.service';
import { MailTemplateService } from 'src/modules/mail/mail-template.service';
import { MailTemplate } from 'src/entities/mail-template.entity';
import { createMockRepository, provideMockRepository } from 'src/testing/repository.mock';

/**
 * The arrears calendar — E16/S7.
 *
 * The gaps are as much the design as the sends: a family written to every day stops reading, and
 * then the message that mattered is the one they had learned to skip. Most of what follows asserts
 * the silence.
 */
describe('ArrearsJob', () => {
    let job: ArrearsJob;
    let arrears: { list: jest.Mock; markOverdue: jest.Mock };
    let outbox: { queueOrRecord: jest.Mock };

    const DAY = new Date(2026, 2, 20);

    /** An invoice issued on 1 March, so the term ran out on the 15th. */
    const row = (overrides: Partial<ArrearsRow> = {}): ArrearsRow => ({
        invoiceId: 7,
        parentId: 1,
        parentName: 'Ana Popescu',
        email: 'ana@example.com',
        phone: '0712345678',
        monthIssued: '2026-03',
        dateIssued: '2026-03-01',
        dueOn: '2026-03-15',
        amount: 350,
        paid: 0,
        outstanding: 350,
        daysOverdue: 5,
        bucket: 'overdue',
        ...overrides,
    });

    beforeEach(async () => {
        arrears = { list: jest.fn().mockResolvedValue([]), markOverdue: jest.fn().mockResolvedValue(0) };
        outbox = { queueOrRecord: jest.fn().mockResolvedValue({ id: 1 }) };

        const module: TestingModule = await Test.createTestingModule({
            providers: [
                ArrearsJob,
                { provide: ArrearsService, useValue: arrears },
                { provide: OutboxService, useValue: outbox },
                MailTemplateService,
                provideMockRepository(MailTemplate, createMockRepository()),
            ],
        }).compile();
        job = module.get(ArrearsJob);
    });

    const message = () => outbox.queueOrRecord.mock.calls[0][1] as { subject: string; bodyText: string; dedupeKey: string };

    describe('the calendar', () => {
        it('writes a friendly notice three days before the term', async () => {
            // 12 March: three days before the 15th.
            arrears.list.mockResolvedValue([row({ daysOverdue: 0 })]);

            const result = await job.runFor(new Date(2026, 2, 15 - NOTICE_DAYS_BEFORE));

            expect(result.notified).toBe(1);
            expect(message().bodyText).toContain('amintire prietenoasă');
        });

        it('says nothing on the other days before the term', async () => {
            arrears.list.mockResolvedValue([row({ daysOverdue: 0 })]);

            await job.runFor(new Date(2026, 2, 10));

            expect(outbox.queueOrRecord).not.toHaveBeenCalled();
        });

        it('writes on the day the term runs out', async () => {
            arrears.list.mockResolvedValue([row({ daysOverdue: 0 })]);
            // Zero days overdue is the due date itself: `0 % 7 === 0`, and the notice branch has
            // already passed, so this is the reminder.
            await job.runFor(new Date(2026, 2, 15));
            expect(outbox.queueOrRecord).not.toHaveBeenCalled();
        });

        it('writes weekly after the term, and only weekly', async () => {
            arrears.list.mockResolvedValue([row({ daysOverdue: REMINDER_INTERVAL_DAYS })]);
            await job.runFor(new Date(2026, 2, 22));
            expect(outbox.queueOrRecord).toHaveBeenCalledTimes(1);

            outbox.queueOrRecord.mockClear();
            arrears.list.mockResolvedValue([row({ daysOverdue: REMINDER_INTERVAL_DAYS + 1 })]);
            await job.runFor(new Date(2026, 2, 23));
            expect(outbox.queueOrRecord).not.toHaveBeenCalled();
        });

        it('stops writing after sixty days — the eleventh identical reminder persuades nobody', async () => {
            arrears.list.mockResolvedValue([row({ daysOverdue: STOP_WRITING_AFTER_DAYS + REMINDER_INTERVAL_DAYS })]);

            await job.runFor(DAY);

            // The row stays on the screen, where somebody can pick up the phone.
            expect(outbox.queueOrRecord).not.toHaveBeenCalled();
        });
    });

    describe('what it says', () => {
        it('asks for what is left, not for the whole invoice again', async () => {
            arrears.list.mockResolvedValue([row({ daysOverdue: 7, amount: 350, paid: 200, outstanding: 150 })]);

            await job.runFor(DAY);

            // Being asked for 350 after paying 200 reads as "you were not credited".
            expect(message().bodyText).toContain('150 lei');
            expect(message().bodyText).not.toContain('350 lei');
        });

        it('keeps the tone of a school talking to a parent', async () => {
            arrears.list.mockResolvedValue([row({ daysOverdue: 7 })]);

            await job.runFor(DAY);

            const body = message().bodyText;
            expect(body).toContain('de obicei e o scăpare');
            expect(body).toContain('găsim o');
        });

        it('names the month in words', async () => {
            arrears.list.mockResolvedValue([row({ daysOverdue: 7 })]);
            await job.runFor(DAY);
            expect(message().subject).toContain('martie');
        });
    });

    describe('safety', () => {
        it('dedupes per invoice per day, so a re-run writes nothing new', async () => {
            arrears.list.mockResolvedValue([row({ daysOverdue: 7 })]);
            await job.runFor(DAY);
            expect(message().dedupeKey).toBe(`${DEDUPE_PREFIX}7:2026-03-20`);
        });

        it('two invoices of the same family are two separate matters', async () => {
            arrears.list.mockResolvedValue([row({ invoiceId: 7, daysOverdue: 7 }), row({ invoiceId: 8, daysOverdue: 7 })]);
            await job.runFor(DAY);
            expect(outbox.queueOrRecord).toHaveBeenCalledTimes(2);
        });

        it('marks overdue before deciding who to write to', async () => {
            arrears.markOverdue.mockResolvedValue(3);
            const result = await job.runFor(DAY);
            expect(result.markedOverdue).toBe(3);
        });

        it('hands a family with no address to the outbox anyway, so S5 records it', async () => {
            arrears.list.mockResolvedValue([row({ daysOverdue: 7, email: null })]);
            await job.runFor(DAY);
            expect(outbox.queueOrRecord).toHaveBeenCalledWith({ email: null }, expect.anything());
        });
    });
});
