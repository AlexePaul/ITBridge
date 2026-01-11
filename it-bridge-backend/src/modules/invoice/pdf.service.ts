import { Injectable } from '@nestjs/common';
import { Invoice, InvoiceStatus } from 'src/entities/invoice.entity';
import PDFDocument from 'pdfkit';
import * as fs from 'fs';
import path from 'path';
import { InjectRepository } from '@nestjs/typeorm';
import { Discount } from 'src/entities/discount.entity';
import { Repository } from 'typeorm/repository/Repository';

@Injectable()
export class PdfService {
    constructor(@InjectRepository(Discount) private discountRepository: Repository<Discount>) {}

    async generateInvoicePdf(invoice: any): Promise<Buffer> {
        const discounts = await this.discountRepository.find({ where: { parent: { id: invoice.parent.id }, monthIssued: invoice.monthIssued } });
        const discountValue = discounts.reduce((sum, discount) => sum + Number(discount.value), 0);

        const items: any[] = [
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
        const PDFDocument = (await import('pdfkit')).default;
        return new Promise((resolve, reject) => {
            const doc = new PDFDocument({ size: 'A4', margin: 50 });
            const chunks: Buffer[] = [];
            doc.on('data', (chunk) => chunks.push(chunk));
            doc.on('end', () => resolve(Buffer.concat(chunks)));
            doc.on('error', reject);

            // Use font from /src/assets/fonts (relative to project root)
            const fontPath = path.join(process.cwd(), 'src/assets/fonts/Roboto-Regular.ttf');
            doc.registerFont('Roboto', fontPath);
            const fontBoldPath = path.join(process.cwd(), 'src/assets/fonts/Roboto-Bold.ttf');
            doc.registerFont('Roboto-Bold', fontBoldPath);
            doc.font('Roboto'); // Use the font

            const logoPath = path.join(process.cwd(), 'src/assets/logo.png');
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
                .text(invoice.id, 150, customerInformationTop)
                .font('Roboto')
                .text('Data:', 50, customerInformationTop + 15)
                .text(this.formatDate(new Date()), 150, customerInformationTop + 15)
                .text('Total de plata:', 50, customerInformationTop + 30)
                .text(this.formatCurrency(total), 150, customerInformationTop + 30)
                .font('Roboto-Bold')
                .text(invoice.parent?.firstName + ' ' + invoice.parent?.lastName, 300, customerInformationTop)
                .font('Roboto')
                .text(invoice.parent?.email, 300, customerInformationTop + 15)
                .moveDown();
            this.generateHr(doc, 252);

            // Invoice Table
            let i;
            const invoiceTableTop = 330;
            doc.font('Roboto-Bold');
            this.generateTableRow(doc, invoiceTableTop, 'Item', 'Descriere', 'Pret unitar', 'Cantitate', 'Total');
            this.generateHr(doc, invoiceTableTop + 20);
            doc.font('Roboto');
            if (items && Array.isArray(items)) {
                for (i = 0; i < items.length; i++) {
                    const item = items[i];
                    const position = invoiceTableTop + (i + 1) * 30;
                    this.generateTableRow(
                        doc,
                        position,
                        item.item,
                        item.description,
                        this.formatCurrency(item.amount / item.quantity),
                        item.quantity,
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

    private generateTableRow(doc, y, item, description, unitCost, quantity, lineTotal) {
        doc.fontSize(10)
            .text(item, 50, y)
            .text(description, 150, y)
            .text(unitCost, 280, y, { width: 90, align: 'right' })
            .text(quantity, 370, y, { width: 90, align: 'right' })
            .text(lineTotal, 0, y, { align: 'right' });
    }

    private generateHr(doc, y) {
        doc.strokeColor('#aaaaaa').lineWidth(1).moveTo(50, y).lineTo(550, y).stroke();
    }

    private formatCurrency(amount) {
        if (typeof amount !== 'number') amount = Number(amount) || 0;
        return amount.toLocaleString('ro-RO', { style: 'currency', currency: 'RON' });
    }

    private formatDate(date) {
        const d = new Date(date);
        const day = String(d.getDate()).padStart(2, '0');
        const month = String(d.getMonth() + 1).padStart(2, '0');
        const year = d.getFullYear();
        return `${day}/${month}/${year}`;
    }
}
