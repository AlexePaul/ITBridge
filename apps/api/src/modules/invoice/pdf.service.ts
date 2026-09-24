import { Injectable } from '@nestjs/common';
import PDFDocument from 'pdfkit';
import * as fs from 'fs';
import path from 'path';
import { InjectRepository } from '@nestjs/typeorm';
import { Discount } from 'src/entities/discount.entity';
import { Invoice } from 'src/entities/invoice.entity';
import { describeDiscount } from 'src/modules/smartbill/smartbill.rules';
import { toIsoDate } from 'src/modules/class-session/class-session.dates';
import { PAYMENT_TERM_DAYS, dueDateFor } from './arrears.rules';
import { romanianMonth } from './money-words';

/** One line on the invoice table. There is one: the month, at the amount the family owes. */
interface InvoiceLine {
    item: string;
    description: string;
    amount: number;
    quantity: number;
}
import { Repository } from 'typeorm/repository/Repository';

@Injectable()
export class PdfService {
    constructor(@InjectRepository(Discount) private discountRepository: Repository<Discount>) {}

    /**
     * The platform's own invoice document — drawn on its first download since E15/S6, so everything
     * printed comes from the row and never from the moment of drawing.
     *
     * **Shaped like SmartBill's**, the document it stands in for until `live` (E15/S7): one line, at
     * the amount the platform computed, and the month's discounts in words beneath it, through the
     * same `describeDiscount`. It used to list each discount as a line in lei, adding the values back
     * onto the amount — right for a `fixed` 50, and a 50% discount printed as "−50 lei" on a line
     * that did not add up. Reading them at download time is safe because a discount on an invoiced
     * month is frozen (`DISCOUNT_MONTH_INVOICED`): what is read is what the amount was computed from.
     */
    async generateInvoicePdf(invoice: Invoice): Promise<Buffer> {
        const discounts = await this.discountRepository.find({
            where: { parent: { id: invoice.parent.id }, monthIssued: invoice.monthIssued },
            order: { id: 'ASC' },
        });
        const mentions = discounts.map((discount) => describeDiscount({ name: discount.name, type: discount.type, value: discount.value }));

        const issuedOn = printedDay(invoice.dateIssued);
        const dueOn = printedDay(toIsoDate(dueDateFor(invoice.dateIssued)));
        const items: InvoiceLine[] = [
            {
                item: 'Servicii educaționale',
                description: `Cursuri, ${romanianMonth(invoice.monthIssued)} ${invoice.monthIssued.slice(0, 4)}`,
                amount: invoice.amount,
                quantity: 1,
            },
        ];
        const total = invoice.amount;
        return new Promise((resolve, reject) => {
            const doc = new PDFDocument({ size: 'A4', margin: 50 });
            const chunks: Buffer[] = [];
            doc.on('data', (chunk: Buffer) => chunks.push(chunk));
            doc.on('end', () => resolve(Buffer.concat(chunks)));
            doc.on('error', reject);

            // Resolved from this file, not from the working directory. `process.cwd()` happened to
            // work only because `src/` sits next to `dist/` in a checkout; running from anywhere
            // else, or shipping only `dist`, produced a PDF with no fonts. `nest-cli.json` copies
            // `src/assets` into `dist/assets`, so the same relative path holds compiled and under
            // ts-node.
            const assetsDir = path.join(__dirname, '..', '..', 'assets');
            const fontPath = path.join(assetsDir, 'fonts/Roboto-Regular.ttf');
            doc.registerFont('Roboto', fontPath);
            const fontBoldPath = path.join(assetsDir, 'fonts/Roboto-Bold.ttf');
            doc.registerFont('Roboto-Bold', fontBoldPath);
            doc.font('Roboto'); // Use the font

            const logoPath = path.join(assetsDir, 'logo.png');
            if (fs.existsSync(logoPath)) {
                doc.image(logoPath, 50, 45, { width: 50 });
            }

            // Header
            doc.fillColor('#444444')
                .fontSize(20)
                .text('IT Bridge School', 110, 57)
                .fontSize(10)
                .text('IT Bridge School', 200, 50, { align: 'right' })
                .text('Strada Exemplu 123', 200, 65, { align: 'right' })
                .text('București, Romania', 200, 80, { align: 'right' })
                .moveDown();

            // Customer Information
            doc.fillColor('#444444').fontSize(20).text('Factura', 50, 160);
            this.generateHr(doc, 185);
            const customerInformationTop = 200;
            doc.fontSize(10)
                .text('Numar Factura:', 50, customerInformationTop)
                .font('Roboto-Bold')
                .text(String(invoice.id), 150, customerInformationTop)
                .font('Roboto')
                // The day on the row, not the day of drawing: since E15/S6 the drawing can happen
                // weeks after the invoice was issued, on whichever day the family first opens it.
                .text('Data emiterii:', 50, customerInformationTop + 15)
                .text(issuedOn, 150, customerInformationTop + 15)
                .text('Total de plata:', 50, customerInformationTop + 30)
                .text(this.formatCurrency(total), 150, customerInformationTop + 30)
                .text('Scadenta:', 50, customerInformationTop + 45)
                .text(dueOn, 150, customerInformationTop + 45)
                .font('Roboto-Bold')
                .text(invoice.parent?.firstName + ' ' + invoice.parent?.lastName, 300, customerInformationTop)
                .font('Roboto')
                .text(invoice.parent?.email ?? '', 300, customerInformationTop + 15)
                .moveDown();
            this.generateHr(doc, 252);

            // Invoice Table
            const invoiceTableTop = 330;
            doc.font('Roboto-Bold');
            this.generateTableRow(doc, invoiceTableTop, 'Item', 'Descriere', 'Pret unitar', 'Cantitate', 'Total');
            this.generateHr(doc, invoiceTableTop + 20);
            doc.font('Roboto');
            if (items && Array.isArray(items)) {
                for (let i = 0; i < items.length; i++) {
                    const item = items[i];
                    const position = invoiceTableTop + (i + 1) * 30;
                    this.generateTableRow(
                        doc,
                        position,
                        item.item,
                        item.description,
                        this.formatCurrency(item.amount / item.quantity),
                        String(item.quantity),
                        this.formatCurrency(item.amount),
                    );
                    this.generateHr(doc, position + 20);
                }
            }
            const subtotalPosition = invoiceTableTop + ((items?.length || 0) + 1) * 30;
            doc.font('Roboto-Bold');
            this.generateTableRow(doc, subtotalPosition, '', '', 'Total', '', this.formatCurrency(total));
            doc.font('Roboto');

            // Why the month cost less, in words — the amount above already has it taken off.
            mentions.forEach((mention, index) => {
                doc.fontSize(10).text(mention, 50, subtotalPosition + 40 + index * 15, { width: 500 });
            });

            // The term the school's terms promise (§11.3) and the arrears screen counts from, not a
            // number of its own: the footer said 30 days while every reminder counted 14.
            doc.fontSize(10).text(`Plata se face in ${PAYMENT_TERM_DAYS} zile de la emitere, pana la ${dueOn}. Va multumim!`, 50, 780, {
                align: 'center',
                width: 500,
            });

            doc.end();
        });
    }

    private generateTableRow(doc: PDFKit.PDFDocument, y: number, item: string, description: string, unitCost: string, quantity: string, lineTotal: string) {
        doc.fontSize(10)
            .text(item, 50, y)
            .text(description, 150, y)
            .text(unitCost, 280, y, { width: 90, align: 'right' })
            .text(quantity, 370, y, { width: 90, align: 'right' })
            .text(lineTotal, 0, y, { align: 'right' });
    }

    private generateHr(doc: PDFKit.PDFDocument, y: number) {
        doc.strokeColor('#aaaaaa').lineWidth(1).moveTo(50, y).lineTo(550, y).stroke();
    }

    private formatCurrency(amount: number | string): string {
        const value = typeof amount === 'number' ? amount : Number(amount) || 0;
        return value.toLocaleString('ro-RO', { style: 'currency', currency: 'RON' });
    }
}

/**
 * A `date` column as the day printed on the document, `DD.MM.YYYY`.
 *
 * From the calendar components, never through `new Date(text)`: that reads `'2026-11-01'` as
 * midnight UTC, which is the day before anywhere west of Greenwich — the one-day trap CLAUDE.md
 * warns about. TypeORM hands a `date` column back as text on one path and as a `Date` on another.
 */
function printedDay(value: Date | string): string {
    const [year, month, day] = (typeof value === 'string' ? value.slice(0, 10) : toIsoDate(value)).split('-');
    return `${day}.${month}.${year}`;
}
