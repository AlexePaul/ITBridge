import { Injectable } from '@nestjs/common';
import PDFDocument from 'pdfkit';
import * as fs from 'fs';
import path from 'path';
import { InjectRepository } from '@nestjs/typeorm';
import { Discount } from 'src/entities/discount.entity';
import { Invoice } from 'src/entities/invoice.entity';

/** One line on the invoice table: the service fee itself, plus one line per discount. */
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

    async generateInvoicePdf(invoice: Invoice): Promise<Buffer> {
        const discounts = await this.discountRepository.find({ where: { parent: { id: invoice.parent.id }, monthIssued: invoice.monthIssued } });
        const discountValue = discounts.reduce((sum, discount) => sum + Number(discount.value), 0);

        const items: InvoiceLine[] = [
            {
                item: 'Servicii educaționale',
                description: 'Taxă lunară pentru cursuri',
                amount: invoice.amount + discountValue,
                quantity: 1,
            },
            ...discounts.map((discount) => ({
                item: `${discount.name}`,
                description: `${discount.description}`,
                amount: -discount.value,
                quantity: 1,
            })),
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
                .text('Data:', 50, customerInformationTop + 15)
                .text(this.formatDate(new Date()), 150, customerInformationTop + 15)
                .text('Total de plata:', 50, customerInformationTop + 30)
                .text(this.formatCurrency(total), 150, customerInformationTop + 30)
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

            // Footer
            doc.fontSize(10).text('Plata este datorata in 30 zile. Va multumim!', 50, 780, { align: 'center', width: 500 });

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

    private formatDate(date: Date | string): string {
        const d = new Date(date);
        const day = String(d.getDate()).padStart(2, '0');
        const month = String(d.getMonth() + 1).padStart(2, '0');
        const year = d.getFullYear();
        return `${day}/${month}/${year}`;
    }
}
