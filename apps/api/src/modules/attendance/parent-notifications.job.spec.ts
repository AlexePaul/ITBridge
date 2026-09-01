import { Test, TestingModule } from '@nestjs/testing';
import { ParentNotificationsJob, ABSENCE_DEDUPE_PREFIX, EXPIRY_DEDUPE_PREFIX, EXPIRY_WARNING_DAYS, romanianDate } from './parent-notifications.job';
import { AbsenceNotice } from 'src/entities/absence-notice.entity';
import { Attendance } from 'src/entities/attendance.entity';
import { MakeUpCredit } from 'src/entities/make-up-credit.entity';
import { OutboxService } from 'src/modules/mail/outbox.service';
import { MailTemplateService } from 'src/modules/mail/mail-template.service';
import { MailTemplate } from 'src/entities/mail-template.entity';
import { createMockRepository, MockRepository, provideMockRepository } from 'src/testing/repository.mock';

describe('ParentNotificationsJob', () => {
    let job: ParentNotificationsJob;
    let attendanceRepo: MockRepository;
    let noticeRepo: MockRepository;
    let creditRepo: MockRepository;
    let outbox: { queueOrRecord: jest.Mock };

    /** A fixed day, so nothing here depends on when the suite runs. */
    const DAY = new Date(2026, 8, 7);

    const parent = (id: number, firstName = 'Ana', email: string | null = 'ana@example.com') => ({ id, firstName, email });
    const absence = (childId: number, sessionId: number, parentId = 1, childName = 'Maria') => ({
        id: childId * 100,
        present: false,
        child: { id: childId, firstName: childName, parent: parent(parentId) },
        classSession: { id: sessionId, date: DAY, startTime: '16:00:00', group: { name: 'Scratch' } },
    });

    beforeEach(async () => {
        attendanceRepo = createMockRepository();
        noticeRepo = createMockRepository();
        creditRepo = createMockRepository();
        outbox = { queueOrRecord: jest.fn().mockResolvedValue({ id: 1 }) };

        attendanceRepo.find!.mockResolvedValue([]);
        noticeRepo.find!.mockResolvedValue([]);
        creditRepo.find!.mockResolvedValue([]);

        const module: TestingModule = await Test.createTestingModule({
            providers: [
                ParentNotificationsJob,
                provideMockRepository(Attendance, attendanceRepo),
                provideMockRepository(AbsenceNotice, noticeRepo),
                provideMockRepository(MakeUpCredit, creditRepo),
                { provide: OutboxService, useValue: outbox },
                // The real template service over an empty override repo, so the wording asserted
                // below is the wording that actually ships.
                MailTemplateService,
                provideMockRepository(MailTemplate, createMockRepository()),
            ],
        }).compile();
        job = module.get(ParentNotificationsJob);
    });

    const queuedMessage = () => outbox.queueOrRecord.mock.calls[0][1] as { subject: string; bodyText: string; dedupeKey: string };

    describe('telling a family their child was not there', () => {
        it('writes to the parent of an unannounced absence', async () => {
            attendanceRepo.find!.mockResolvedValue([absence(5, 9)]);

            const result = await job.notifyAbsences(DAY);

            expect(result.notified).toBe(1);
            expect(queuedMessage().bodyText).toContain('Maria');
        });

        it('says nothing about an absence the family already announced', async () => {
            attendanceRepo.find!.mockResolvedValue([absence(5, 9)]);
            noticeRepo.find!.mockResolvedValue([{ child: { id: 5 }, classSession: { id: 9 } }]);

            // Writing back to a family to tell them what they themselves told us is the kind of
            // noise that teaches people to filter the sender — and then it is not read on the day
            // it mattered.
            const result = await job.notifyAbsences(DAY);

            expect(result.notified).toBe(0);
            expect(outbox.queueOrRecord).not.toHaveBeenCalled();
        });

        it('one message per parent, not one per child', async () => {
            attendanceRepo.find!.mockResolvedValue([absence(5, 9, 1, 'Maria'), absence(6, 10, 1, 'Andrei')]);

            const result = await job.notifyAbsences(DAY);

            expect(result.notified).toBe(1);
            expect(outbox.queueOrRecord).toHaveBeenCalledTimes(1);
            const body = queuedMessage().bodyText;
            expect(body).toContain('Maria');
            expect(body).toContain('Andrei');
        });

        it('writes separately to separate families', async () => {
            attendanceRepo.find!.mockResolvedValue([absence(5, 9, 1), absence(7, 9, 2)]);
            await job.notifyAbsences(DAY);
            expect(outbox.queueOrRecord).toHaveBeenCalledTimes(2);
        });

        it('dedupes per parent per day, so a re-run at 19:05 writes nothing new', async () => {
            attendanceRepo.find!.mockResolvedValue([absence(5, 9, 1)]);
            await job.notifyAbsences(DAY);
            expect(queuedMessage().dedupeKey).toBe(`${ABSENCE_DEDUPE_PREFIX}2026-09-07:1`);
        });

        it('writes nothing at all on a day with no absences', async () => {
            await expect(job.notifyAbsences(DAY)).resolves.toMatchObject({ notified: 0 });
            expect(outbox.queueOrRecord).not.toHaveBeenCalled();
        });

        it('hands the recipient to the outbox even with no address, so S5 can record it', async () => {
            attendanceRepo.find!.mockResolvedValue([absence(5, 9, 1)].map((a) => ({ ...a, child: { ...a.child, parent: parent(1, 'Ana', null) } })));

            await job.notifyAbsences(DAY);

            // Not skipped: E17/S5's rule is that a family who should have been reached and was not
            // leaves a row. The job does not branch on the address at all.
            expect(outbox.queueOrRecord).toHaveBeenCalledWith({ email: null }, expect.anything());
        });
    });

    describe('reminding about a lapsing make-up', () => {
        const credit = (id: number, expiresOn: Date) => ({
            id,
            expiresOn,
            child: { id: 5, firstName: 'Maria', parent: parent(1) },
        });

        it('asks for credits lapsing exactly the warning window out', async () => {
            await job.remindExpiring(DAY);

            // Exactly, not "within": a range would write on every one of the seven days, which is
            // how a helpful reminder becomes a nuisance.
            const where = (creditRepo.find!.mock.calls[0][0] as { where: { expiresOn: Date } }).where;
            expect(where.expiresOn).toEqual(new Date(2026, 8, 7 + EXPIRY_WARNING_DAYS));
        });

        it('asks only for credits that are neither booked nor spent', async () => {
            await job.remindExpiring(DAY);
            const where = (creditRepo.find!.mock.calls[0][0] as { where: Record<string, unknown> }).where;
            expect(where.bookedSession).toBeDefined();
            expect(where.consumedAttendance).toBeDefined();
        });

        it('writes to the family, naming the child and the last day in words', async () => {
            creditRepo.find!.mockResolvedValue([credit(4, new Date(2026, 9, 7))]);

            const result = await job.remindExpiring(DAY);

            expect(result.notified).toBe(1);
            expect(queuedMessage().subject).toContain('Maria');
            expect(queuedMessage().bodyText).toContain('7 octombrie');
        });

        it('dedupes per credit — the reminder goes out once, whatever else runs', async () => {
            creditRepo.find!.mockResolvedValue([credit(4, new Date(2026, 9, 7))]);
            await job.remindExpiring(DAY);
            expect(queuedMessage().dedupeKey).toBe(`${EXPIRY_DEDUPE_PREFIX}4`);
        });
    });

    describe('romanianDate', () => {
        it('reads as a sentence, not as a column', () => {
            expect(romanianDate(new Date(2026, 9, 7))).toBe('7 octombrie');
        });

        it('accepts the string the driver returns for a date column', () => {
            expect(romanianDate('2026-01-15')).toBe('15 ianuarie');
        });
    });
});
