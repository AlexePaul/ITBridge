import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import { DataSource, FindOptionsWhere, In, IsNull, Not, Repository } from 'typeorm';
import { BankStatementLine } from 'src/entities/bank-statement-line.entity';
import { Invoice } from 'src/entities/invoice.entity';
import { Payment } from 'src/entities/payment.entity';
import { PaymentMethod } from 'src/enum/payment-method.enum';
import { PaymentStatus } from 'src/enum/payment-status.enum';
import { ArrearsService } from 'src/modules/invoice/arrears.service';
import { PaymentService } from 'src/modules/payment/payment.service';
import type { Actor } from 'src/modules/audit/audit.service';
import { parseIsoDate, toIsoDate } from 'src/modules/class-session/class-session.dates';
import { fingerprintLines, parseStatement, StatementFormatError, type StatementParse } from './statement-parser';
import { suggestMatch, withRunningRemainder, type MatchConfidence, type MatchSuggestion, type OpenInvoice } from './statement-matching.rules';

export interface StatementImportResult {
    /** Incoming lines the file holds. */
    credits: number;
    imported: number;
    /** Lines an earlier import already brought in: the same line is never added twice. */
    duplicates: number;
    /** Outgoing lines, set aside. */
    debits: number;
    unreadable: StatementParse['unreadable'];
    columns: StatementParse['columns'];
    /** Of the imported lines: how many have a proposal, and how many of those are by reference. */
    suggested: number;
    suggestedByReference: number;
}

export type StatementLineState = 'waiting' | 'matched' | 'ignored';

export interface StatementLineSuggestion {
    invoiceId: number;
    confidence: MatchConfidence;
    overpays: boolean;
    familyName: string;
    monthIssued: string;
    fiscalSeries: string | null;
    fiscalNumber: string | null;
    outstanding: number;
}

export interface StatementLineView {
    id: number;
    bookedOn: string;
    amount: number;
    description: string;
    counterparty: string | null;
    bankReference: string | null;
    state: StatementLineState;
    importedAt: string;
    /** For a waiting line: the invoice it probably pays, or nothing a rule would stand behind. */
    suggestion: StatementLineSuggestion | null;
    /** For a matched line: the payment it became. */
    payment: { id: number; invoiceId: number; familyName: string; monthIssued: string; status: PaymentStatus } | null;
}

export interface StatementLinesPage {
    counts: Record<StatementLineState, number>;
    /** Waiting lines matched by reference, not paying more than is left: what one press confirms. */
    sureCount: number;
    lines: StatementLineView[];
}

/**
 * A payment that is money. A line whose payment was reversed or failed is not paid by anything, so it
 * waits for a person again (QA of 26 September 2026): it read "Înregistrate" with no sign of the
 * reversal while the invoice was back in arrears, and could not be matched again.
 */
const MONEY = [PaymentStatus.SUCCEEDED, PaymentStatus.INITIATED];
const NOT_MONEY = [PaymentStatus.REVERSED, PaymentStatus.FAILED];

function stateOf(line: BankStatementLine): StatementLineState {
    if (line.payment && MONEY.includes(line.payment.status)) return 'matched';
    return line.ignoredAt ? 'ignored' : 'waiting';
}

/** Matched and ignored lines are history: the most recent ones are enough to look back at. */
const HISTORY_LIMIT = 200;

/**
 * The bank statement half of E16/S8: "import de extras bancar cu potrivire automată după sumă, dată
 * și referință; ce nu se potrivește ajunge într-o coadă pentru decizie umană".
 *
 * **Nothing is recorded without a person.** A proposal is a proposal until somebody confirms it —
 * one line at a time, or every line matched by reference with one press. A confirmed line becomes a
 * payment through `PaymentService.createPayment`, the one door money comes in by: the invoice is
 * rederived, the family gets its confirmation and the payment goes to SmartBill, exactly as if it
 * had been typed — "un singur loc de introducere".
 *
 * **What an invoice still owes comes from the arrears list**, not from a query here: "mai are ceva
 * de plată" has one definition (E16/S5), and a second would be the one that disagrees.
 */
@Injectable()
export class ReconciliationService {
    constructor(
        @InjectRepository(BankStatementLine) private readonly lineRepository: Repository<BankStatementLine>,
        @InjectRepository(Invoice) private readonly invoiceRepository: Repository<Invoice>,
        @InjectDataSource() private readonly dataSource: DataSource,
        private readonly arrears: ArrearsService,
        private readonly payments: PaymentService,
    ) {}

    async importStatement(content: string): Promise<StatementImportResult> {
        let parsed: StatementParse;
        try {
            parsed = parseStatement(content);
        } catch (error: unknown) {
            if (error instanceof StatementFormatError) {
                throw new BadRequestException({ message: error.message, error: 'STATEMENT_UNREADABLE' });
            }
            throw error;
        }

        const fingerprints = fingerprintLines(parsed.lines);
        const rows = parsed.lines.map((line, index) => ({
            fingerprint: fingerprints[index],
            bookedOn: parseIsoDate(line.bookedOn),
            amount: line.amount,
            description: line.description.slice(0, 500),
            counterparty: line.counterparty?.slice(0, 200) ?? null,
            bankReference: line.reference?.slice(0, 100) ?? null,
        }));

        let insertedIds: number[] = [];
        if (rows.length > 0) {
            // `ON CONFLICT DO NOTHING`: a line already imported from an overlapping statement is
            // skipped, and `RETURNING` names only the ones that were new.
            const result = await this.lineRepository.createQueryBuilder().insert().into(BankStatementLine).values(rows).orIgnore().returning(['id']).execute();
            insertedIds = (result.raw as { id: number }[]).map((row) => row.id);
        }

        const imported = insertedIds.length ? await this.lineRepository.findBy({ id: In(insertedIds) }) : [];
        const open = await this.openInvoices();
        const suggestions = imported.map((line) => suggestMatch(line, open));

        return {
            credits: parsed.lines.length,
            imported: insertedIds.length,
            duplicates: parsed.lines.length - insertedIds.length,
            debits: parsed.debits,
            unreadable: parsed.unreadable,
            columns: parsed.columns,
            suggested: suggestions.filter(Boolean).length,
            suggestedByReference: suggestions.filter((suggestion) => suggestion?.confidence === 'reference').length,
        };
    }

    async lines(state: StatementLineState = 'waiting'): Promise<StatementLinesPage> {
        // `stateOf`, as queries: a reversed or failed payment counts as no payment.
        const whereState: Record<StatementLineState, FindOptionsWhere<BankStatementLine>[]> = {
            waiting: [
                { payment: IsNull(), ignoredAt: IsNull() },
                { payment: { status: In(NOT_MONEY) }, ignoredAt: IsNull() },
            ],
            matched: [{ payment: { status: In(MONEY) } }],
            ignored: [
                { payment: IsNull(), ignoredAt: Not(IsNull()) },
                { payment: { status: In(NOT_MONEY) }, ignoredAt: Not(IsNull()) },
            ],
        };
        const [waitingCount, matchedCount, ignoredCount] = await Promise.all([
            this.lineRepository.count({ where: whereState.waiting }),
            this.lineRepository.count({ where: whereState.matched }),
            this.lineRepository.count({ where: whereState.ignored }),
        ]);

        const lines = await this.lineRepository.find({
            where: whereState[state],
            relations: { payment: { invoice: { parent: true } } },
            order: { bookedOn: 'DESC', id: 'DESC' },
            ...(state === 'waiting' ? {} : { take: HISTORY_LIMIT }),
        });

        const open = state === 'waiting' ? await this.openInvoices() : [];
        const openById = new Map(open.map((invoice) => [invoice.invoiceId, invoice]));
        // Judged together, not one by one: two waiting lines that cite the same invoice must not
        // both count as sure, or one press records the invoice paid twice. See `withRunningRemainder`.
        const suggestions =
            state === 'waiting'
                ? withRunningRemainder(
                      lines.map((line) => ({ id: line.id, bookedOn: toIsoDate(line.bookedOn), amount: line.amount })),
                      new Map(lines.map((line) => [line.id, suggestMatch(line, open)])),
                      open,
                  )
                : new Map<number, MatchSuggestion | null>();
        let sureCount = 0;

        const views = lines.map((line): StatementLineView => {
            const suggestion = suggestions.get(line.id) ?? null;
            const target = suggestion ? openById.get(suggestion.invoiceId) : undefined;
            // A line whose payment somebody reversed goes back to a person, never to the one press:
            // the reference that proposed it proposes the same match somebody just undid.
            if (suggestion?.confidence === 'reference' && !suggestion.overpays && !line.payment) sureCount++;
            return {
                id: line.id,
                bookedOn: toIsoDate(line.bookedOn),
                amount: line.amount,
                description: line.description,
                counterparty: line.counterparty,
                bankReference: line.bankReference,
                state: stateOf(line),
                importedAt: line.importedAt.toISOString(),
                suggestion:
                    suggestion && target
                        ? {
                              ...suggestion,
                              familyName: `${target.family.lastName} ${target.family.firstName}`.trim(),
                              monthIssued: target.monthIssued,
                              fiscalSeries: target.fiscalSeries,
                              fiscalNumber: target.fiscalNumber,
                              outstanding: target.outstanding,
                          }
                        : null,
                payment: line.payment
                    ? {
                          id: line.payment.id,
                          invoiceId: line.payment.invoice.id,
                          familyName: `${line.payment.invoice.parent?.lastName ?? ''} ${line.payment.invoice.parent?.firstName ?? ''}`.trim(),
                          monthIssued: line.payment.invoice.monthIssued,
                          status: line.payment.status,
                      }
                    : null,
            };
        });

        return { counts: { waiting: waitingCount, matched: matchedCount, ignored: ignoredCount }, sureCount, lines: views };
    }

    /**
     * Records a line as a payment on an invoice, in one transaction with the line's link to it: a
     * payment without its line would be matched a second time, a line without its payment would
     * claim money nobody recorded.
     */
    async match(lineId: number, invoiceId: number, userId: number | undefined, actor: Actor, acceptOverpayment = false): Promise<StatementLineView> {
        await this.dataSource.transaction(async (manager) => {
            const locked = await manager.findOne(BankStatementLine, { where: { id: lineId }, lock: { mode: 'pessimistic_write' } });
            if (!locked) throw new NotFoundException('Statement line not found');
            const line = await manager.findOneOrFail(BankStatementLine, { where: { id: lineId }, relations: { payment: true } });
            if (line.payment && MONEY.includes(line.payment.status)) {
                throw new ConflictException({
                    message: `Statement line ${lineId} is already recorded as payment ${line.payment.id}.`,
                    error: 'STATEMENT_LINE_ALREADY_MATCHED',
                });
            }

            // What the invoice still owes, read now and under its lock — not the "rest" the page showed.
            // A proposal confirmed from a page opened before the office took the same money in cash
            // recorded a second payment on a paid invoice, 700 on 350, and sent the family two
            // "achitată" receipts (QA of 26 September 2026). More than is owed is the office's
            // decision to make on purpose, not a stale row's.
            if (!acceptOverpayment) {
                const invoice = await manager.findOne(Invoice, { where: { id: invoiceId }, lock: { mode: 'pessimistic_write' } });
                if (!invoice) throw new NotFoundException('Invoice not found');
                const [{ paid }] = await manager.query<{ paid: string }[]>(
                    `SELECT COALESCE(SUM(amount), 0) AS paid FROM payments WHERE invoice_id = $1 AND status = $2`,
                    [invoiceId, PaymentStatus.SUCCEEDED],
                );
                const owed = Math.round((invoice.amount - Number(paid)) * 100) / 100;
                if (line.amount > owed) {
                    throw new ConflictException({
                        message: `Statement line ${lineId} pays ${line.amount} on invoice ${invoiceId}, which has ${owed} left.`,
                        error: 'STATEMENT_LINE_EXCEEDS_REMAINDER',
                    });
                }
            }

            const bookedOn = toIsoDate(line.bookedOn);
            // The bank's own reference and nothing else: the transfer's text goes in the note, which
            // an erasure clears, and not in the reference, where it would outlive the family with
            // their child's name in it — families write names there as often as numbers.
            const reference = line.bankReference?.slice(0, 100) || undefined;
            const note = `Din extrasul bancar, ${bookedOn}: ${line.description}`.slice(0, 500);

            // A transfer the office already recorded as announced, for exactly this sum, is this money
            // arriving: it is confirmed, not recorded a second time beside it — E16/S6. Recorded
            // again, the invoice would read paid twice over while the announced row sat in the
            // register forever, waiting for money that had come.
            const announced = await manager.findOne(Payment, {
                where: { invoice: { id: invoiceId }, status: PaymentStatus.INITIATED, method: PaymentMethod.BANK_TRANSFER, amount: line.amount },
                order: { id: 'ASC' },
            });
            const payment = announced
                ? await this.payments.updatePayment(
                      announced.id,
                      {
                          status: PaymentStatus.SUCCEEDED,
                          date: bookedOn,
                          externalReference: announced.externalReference ? undefined : reference,
                          notes: announced.notes ? undefined : note,
                      },
                      actor,
                      manager,
                  )
                : await this.payments.createPayment(
                      {
                          invoiceId,
                          amount: line.amount,
                          method: PaymentMethod.BANK_TRANSFER,
                          status: PaymentStatus.SUCCEEDED,
                          date: bookedOn,
                          externalReference: reference,
                          notes: note,
                      },
                      userId,
                      actor,
                      manager,
                  );
            await manager.update(BankStatementLine, line.id, { payment: { id: payment.id }, ignoredAt: null });
        });
        return this.view(lineId);
    }

    /**
     * Every waiting line matched by its fiscal reference and not paying more than is left, confirmed
     * with one press. Each line is its own transaction, so one that fails — an invoice that became
     * waived meanwhile — does not take the others back with it.
     */
    async confirmSure(userId: number | undefined, actor: Actor): Promise<{ confirmed: number; failed: number }> {
        const page = await this.lines('waiting');
        let confirmed = 0;
        let failed = 0;
        // Oldest first — the order the sure ones were judged in, each against what the ones before
        // it left. The page lists newest first.
        const oldestFirst = [...page.lines].sort((a, b) => a.bookedOn.localeCompare(b.bookedOn) || a.id - b.id);
        for (const line of oldestFirst) {
            const suggestion = line.suggestion;
            if (!suggestion || suggestion.confidence !== 'reference' || suggestion.overpays || line.payment) continue;
            try {
                await this.match(line.id, suggestion.invoiceId, userId, actor);
                confirmed++;
            } catch {
                failed++;
            }
        }
        return { confirmed, failed };
    }

    /** "Not a family paying an invoice" — a refund, a grant, a mistake. Reversible with `reopen`. */
    async ignore(lineId: number): Promise<StatementLineView> {
        await this.setIgnored(lineId, new Date());
        return this.view(lineId);
    }

    async reopen(lineId: number): Promise<StatementLineView> {
        await this.setIgnored(lineId, null);
        return this.view(lineId);
    }

    private async setIgnored(lineId: number, ignoredAt: Date | null): Promise<void> {
        await this.dataSource.transaction(async (manager) => {
            const locked = await manager.findOne(BankStatementLine, { where: { id: lineId }, lock: { mode: 'pessimistic_write' } });
            if (!locked) throw new NotFoundException('Statement line not found');
            const line = await manager.findOneOrFail(BankStatementLine, { where: { id: lineId }, relations: { payment: true } });
            if (line.payment && MONEY.includes(line.payment.status)) {
                throw new ConflictException({
                    message: `Statement line ${lineId} is already recorded as payment ${line.payment.id}.`,
                    error: 'STATEMENT_LINE_ALREADY_MATCHED',
                });
            }
            await manager.update(BankStatementLine, line.id, { ignoredAt });
        });
    }

    private async view(lineId: number): Promise<StatementLineView> {
        const line = await this.lineRepository.findOneOrFail({ where: { id: lineId }, relations: { payment: { invoice: { parent: true } } } });
        return {
            id: line.id,
            bookedOn: toIsoDate(line.bookedOn),
            amount: line.amount,
            description: line.description,
            counterparty: line.counterparty,
            bankReference: line.bankReference,
            state: stateOf(line),
            importedAt: line.importedAt.toISOString(),
            suggestion: null,
            payment: line.payment
                ? {
                      id: line.payment.id,
                      invoiceId: line.payment.invoice.id,
                      familyName: `${line.payment.invoice.parent?.lastName ?? ''} ${line.payment.invoice.parent?.firstName ?? ''}`.trim(),
                      monthIssued: line.payment.invoice.monthIssued,
                      status: line.payment.status,
                  }
                : null,
        };
    }

    /**
     * The invoices a line can pay: the arrears list — the one definition of "still owes something"
     * — with what matching also needs, the fiscal reference and the family's two names apart.
     */
    private async openInvoices(): Promise<OpenInvoice[]> {
        const owing = await this.arrears.list();
        if (owing.length === 0) return [];
        const invoices = await this.invoiceRepository.find({ where: { id: In(owing.map((row) => row.invoiceId)) }, relations: { parent: true } });
        const byId = new Map(invoices.map((invoice) => [invoice.id, invoice]));
        return owing.flatMap((row) => {
            const invoice = byId.get(row.invoiceId);
            if (!invoice?.parent) return [];
            return [
                {
                    invoiceId: row.invoiceId,
                    monthIssued: row.monthIssued,
                    outstanding: row.outstanding,
                    fiscalSeries: invoice.fiscalSeries,
                    fiscalNumber: invoice.fiscalNumber,
                    family: { parentId: invoice.parent.id, firstName: invoice.parent.firstName ?? '', lastName: invoice.parent.lastName ?? '' },
                },
            ];
        });
    }
}
