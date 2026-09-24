import '../src/load-env';
import { DataSource } from 'typeorm';
import { dataSourceOptions } from '../src/data-source';
import { Invoice } from '../src/entities/invoice.entity';
import { Discount } from '../src/entities/discount.entity';
import { smartBillProblems } from '../src/config/env.validation';
import { mayIssueFiscalDocuments, missingSmartBillSettings, smartBillConfig } from '../src/modules/smartbill/smartbill.config';
import { SmartBillService } from '../src/modules/smartbill/smartbill.service';
import { invoicePayload, type FiscalInvoiceInput } from '../src/modules/smartbill/smartbill.rules';
import { draftReceiptPayload } from '../src/modules/smartbill/smartbill-payment.rules';
import { dueDateFor } from '../src/modules/invoice/arrears.rules';
import { toIsoDate } from '../src/modules/class-session/class-session.dates';

/**
 * E16/S0, without a sandbox: does the account let the platform in, and does it have what the
 * platform will ask for?
 *
 *     pnpm smartbill:check                       # reads only — no document of any kind
 *     pnpm smartbill:check --draft               # plus ONE draft, for a made-up family
 *     pnpm smartbill:check --draft --invoice 412 # plus ONE draft of what invoice 412 would send
 *     pnpm smartbill:check --draft --receipt     # plus ONE draft receipt, on the receipt series
 *
 * **Without `--draft` it only reads**: the VAT rates (`GET /tax`) and the document series
 * (`GET /series`). A token that works, a CIF the token can see and a series that exists are three
 * answers no invoice is needed for — and they are the three S0 exists to get before any code runs.
 *
 * **With `--draft` it sends exactly one draft**, always a draft, whatever `SMARTBILL_MODE` says:
 * "fara numar alocat pana la finalizarea manuala" — no number, not a fiscal document, never in SPV.
 * It is the look at the real document that the missing sandbox would have given: open the link it
 * prints, check the layout, the VAT and the wording, then delete the draft in SmartBill Cloud. With
 * `--invoice`, the draft carries exactly the payload the fiscal queue would send for that invoice.
 *
 * The token is never printed. Exit code 1 on anything that would stop the platform from issuing.
 */

function argument(name: string): string | undefined {
    const index = process.argv.indexOf(name);
    if (index === -1) return undefined;
    const next = process.argv[index + 1];
    return next && !next.startsWith('--') ? next : '';
}

async function draftInputFor(invoiceId: number): Promise<FiscalInvoiceInput> {
    const dataSource = new DataSource({ ...dataSourceOptions, logging: false });
    await dataSource.initialize();
    try {
        const invoice = await dataSource.getRepository(Invoice).findOne({ where: { id: invoiceId }, relations: { parent: true } });
        if (!invoice?.parent) throw new Error(`Invoice ${invoiceId} not found, or it has no family attached`);
        const discounts = await dataSource.getRepository(Discount).find({ where: { parent: { id: invoice.parent.id }, monthIssued: invoice.monthIssued } });
        return {
            invoiceId: invoice.id,
            amount: invoice.amount,
            issueDate: toIsoDate(invoice.dateIssued),
            dueDate: toIsoDate(dueDateFor(invoice.dateIssued)),
            monthIssued: invoice.monthIssued,
            client: { name: `${invoice.parent.lastName} ${invoice.parent.firstName}`.trim(), address: invoice.parent.address?.trim() || null },
            discounts: discounts.map((discount) => ({ name: discount.name, type: discount.type, value: discount.value })),
        };
    } finally {
        await dataSource.destroy();
    }
}

function syntheticInput(): FiscalInvoiceInput {
    const today = toIsoDate(new Date());
    return {
        invoiceId: 0,
        // A month of four sessions with the referral's half off: the line and the mention agree.
        amount: 175,
        issueDate: today,
        dueDate: toIsoDate(dueDateFor(today)),
        monthIssued: today.slice(0, 7),
        client: { name: 'TEST ITBridge — ciornă de verificare, se șterge', address: 'Adresă de test' },
        discounts: [{ name: 'Recomandare', type: 'percent', value: 50 }],
    };
}

async function main(): Promise<number> {
    const config = smartBillConfig();
    let failures = 0;

    console.log('SmartBill — verificare fără documente fiscale (E16 S0)\n');
    console.log(`  mod configurat   ${config.mode}`);
    console.log(
        `  mediu            NODE_ENV=${process.env.NODE_ENV ?? '(nesetat)'} — ${mayIssueFiscalDocuments() ? 'poate emite facturi fiscale' : 'doar ciorne: facturile fiscale se emit numai din production'}`,
    );
    console.log(`  API              ${config.baseUrl}`);
    console.log(`  utilizator       ${config.username ?? '(nesetat)'}`);
    console.log(`  token            ${config.token ? '(setat, nu se afișează)' : '(nesetat)'}`);
    console.log(`  CIF              ${config.cif ?? '(nesetat)'}`);
    console.log(`  seria facturilor ${config.invoiceSeries ?? '(nesetată)'}`);
    console.log(`  seria chitanțelor ${config.receiptSeries ?? '(nesetată)'}`);
    console.log(`  unitate          ${config.measuringUnit}`);
    console.log(`  TVA              ${config.tax ? `${config.tax.name} ${config.tax.percentage}%` : 'fără (neplătitor de TVA)'}\n`);

    for (const problem of smartBillProblems(process.env)) {
        console.log(`  ✗ ${problem}`);
        failures++;
    }
    const missing = missingSmartBillSettings(config);
    if (missing.length > 0) {
        console.log(`  ✗ Lipsesc ${missing.join(', ')} — nu se poate întreba nimic.`);
        return 1;
    }

    const smartBill = new SmartBillService();

    try {
        const taxes = await smartBill.taxes();
        console.log(`  ✓ Autentificare reușită. Cote TVA în cont: ${taxes.map((tax) => `${tax.name} ${tax.percentage}%`).join(', ') || '(niciuna)'}`);
        if (config.tax) {
            const match = taxes.find((tax) => tax.name === config.tax?.name);
            if (!match) {
                console.log(`  ✗ Cota „${config.tax.name}” nu există în cont — SmartBill ar refuza fiecare factură.`);
                failures++;
            } else if (match.percentage !== config.tax.percentage) {
                console.log(`  ✗ Cota „${match.name}” e ${match.percentage}% în cont, nu ${config.tax.percentage}%.`);
                failures++;
            }
        } else {
            console.log('    Nicio cotă configurată: facturile pleacă fără TVA. Corect doar dacă școala nu e plătitoare de TVA.');
        }
    } catch (error: unknown) {
        console.log(`  ✗ ${error instanceof Error ? error.message : String(error)}`);
        return 1;
    }

    try {
        const invoiceSeries = await smartBill.series('f');
        const receiptSeries = await smartBill.series('c');
        console.log(`  ✓ Serii de facturi: ${invoiceSeries.map((series) => `${series.name} (următorul ${series.nextNumber})`).join(', ') || '(niciuna)'}`);
        console.log(`    Serii de chitanțe: ${receiptSeries.map((series) => `${series.name} (următorul ${series.nextNumber})`).join(', ') || '(niciuna)'}`);
        const own = invoiceSeries.find((series) => series.name === config.invoiceSeries);
        if (own) {
            console.log(`  ✓ Seria platformei, ${own.name}: prima factură ar primi numărul ${own.nextNumber}.`);
        } else {
            console.log(`  ✗ Seria „${config.invoiceSeries}” nu există — se creează în SmartBill Cloud > Configurare > Serii.`);
            failures++;
        }
        // E16/S5: a cash payment becomes a numbered receipt on the platform's own receipt series.
        if (config.receiptSeries) {
            const receipts = receiptSeries.find((series) => series.name === config.receiptSeries);
            if (receipts) {
                console.log(`  ✓ Seria de chitanțe a platformei, ${receipts.name}: prima chitanță ar primi numărul ${receipts.nextNumber}.`);
            } else {
                console.log(`  ✗ Seria de chitanțe „${config.receiptSeries}” nu există — se creează în SmartBill Cloud > Configurare > Serii.`);
                failures++;
            }
        } else {
            console.log('    Nicio serie de chitanțe configurată: în live, plățile în numerar n-ar avea pe ce să fie numerotate.');
        }
    } catch (error: unknown) {
        console.log(`  ✗ ${error instanceof Error ? error.message : String(error)}`);
        return 1;
    }

    const draft = argument('--draft') !== undefined;
    if (!draft) {
        console.log('\nNu s-a creat niciun document. Cu --draft se trimite o singură ciornă, de văzut și de șters.');
        return failures > 0 ? 1 : 0;
    }
    if (failures > 0) {
        console.log('\nCiorna nu se trimite cât timp verificările de mai sus pică.');
        return 1;
    }

    if (argument('--receipt') !== undefined) {
        if (!config.receiptSeries) {
            console.log('\n  ✗ --receipt cere SMARTBILL_RECEIPT_SERIES.');
            return 1;
        }
        // Always a draft, like the invoice below: "Chitanta ciorna", no number until finalised by hand.
        const receipt = draftReceiptPayload(
            { amount: 175, date: toIsoDate(new Date()), client: { name: 'TEST ITBridge — ciornă de verificare, se șterge', address: 'Adresă de test' } },
            config,
        );
        try {
            await smartBill.recordPayment(receipt);
            console.log(`\n  ✓ Chitanță ciornă creată pe seria ${config.receiptSeries} — fără număr, nu e document fiscal.`);
            console.log('    E în SmartBill Cloud la Încasări, la ciorne. Verifică textul și seria, apoi șterge-o.');
        } catch (error: unknown) {
            console.log(`\n  ✗ SmartBill a refuzat chitanța ciornă: ${error instanceof Error ? error.message : String(error)}`);
            return 1;
        }
        return 0;
    }

    const invoiceArgument = argument('--invoice');
    const input = invoiceArgument ? await draftInputFor(Number(invoiceArgument)) : syntheticInput();
    // Always a draft: the third argument is the whole point of this script.
    const payload = invoicePayload(input, config, true);

    try {
        const document = await smartBill.issueInvoice(payload);
        console.log(`\n  ✓ Ciornă creată${invoiceArgument ? ` din factura ${invoiceArgument}` : ''} — fără număr, nu e document fiscal.`);
        console.log(`    Deschide-o: ${document.documentUrl ?? '(SmartBill nu a trimis linkul; e în Rapoarte > Facturi, la ciorne)'}`);
        console.log('    Verifică denumirea, suma, TVA-ul și mențiunile, apoi șterge ciorna din SmartBill Cloud.');
    } catch (error: unknown) {
        console.log(`\n  ✗ SmartBill a refuzat ciorna: ${error instanceof Error ? error.message : String(error)}`);
        return 1;
    }
    return 0;
}

main()
    .then((code) => process.exit(code))
    .catch((error: unknown) => {
        console.error(error instanceof Error ? error.message : String(error));
        process.exit(1);
    });
