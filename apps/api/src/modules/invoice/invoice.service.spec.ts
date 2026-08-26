import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { InvoiceService } from './invoice.service';
import { PdfService } from './pdf.service';
import { S3Service } from './s3.service';
import { Invoice, InvoiceStatus } from 'src/entities/invoice.entity';
import { Profile } from 'src/entities/profile.entity';
import { Discount } from 'src/entities/discount.entity';
import { Role } from 'src/enum/role.enum';
import { createMockQueryBuilder, createMockRepository, isScopedToUser, MockRepository, provideMockRepository } from 'src/testing/repository.mock';

describe('InvoiceService', () => {
    let service: InvoiceService;
    let invoiceRepo: MockRepository;
    let profileRepo: MockRepository;
    let discountRepo: MockRepository;
    let s3: { uploadFile: jest.Mock; downloadFile: jest.Mock };

    /** Profil cu `n` copii, cât să treacă de verificările din `calculateAmount`. */
    const profileWithChildren = (n: number, id = 1) => ({
        id,
        firstName: 'Ana',
        lastName: 'Pop',
        children: Array.from({ length: n }, (_, i) => ({ id: i + 1 })),
    });

    beforeEach(async () => {
        invoiceRepo = createMockRepository();
        profileRepo = createMockRepository();
        discountRepo = createMockRepository();
        s3 = { uploadFile: jest.fn(), downloadFile: jest.fn() };

        const module: TestingModule = await Test.createTestingModule({
            providers: [
                InvoiceService,
                provideMockRepository(Invoice, invoiceRepo),
                provideMockRepository(Profile, profileRepo),
                provideMockRepository(Discount, discountRepo),
                { provide: PdfService, useValue: { generateInvoicePdf: jest.fn().mockResolvedValue(Buffer.from('')) } },
                { provide: S3Service, useValue: s3 },
            ],
        }).compile();

        service = module.get(InvoiceService);
    });

    describe('calculateAmount', () => {
        beforeEach(() => {
            discountRepo.find!.mockResolvedValue([]);
        });

        it('cere 350 pentru un singur copil', async () => {
            profileRepo.findOne!.mockResolvedValue(profileWithChildren(1));
            await expect(service.calculateAmount(1, '2026-03')).resolves.toBe(350);
        });

        it('cere 250 de copil pentru doi copii, adică 500', async () => {
            profileRepo.findOne!.mockResolvedValue(profileWithChildren(2));
            await expect(service.calculateAmount(1, '2026-03')).resolves.toBe(500);
        });

        it('scade reducerile din lună', async () => {
            profileRepo.findOne!.mockResolvedValue(profileWithChildren(1));
            discountRepo.find!.mockResolvedValue([{ value: 50 }, { value: 25 }]);
            await expect(service.calculateAmount(1, '2026-03')).resolves.toBe(275);
        });

        it('filtrează reducerile după părinte și lună', async () => {
            profileRepo.findOne!.mockResolvedValue(profileWithChildren(1, 7));
            await service.calculateAmount(7, '2026-03');
            expect(discountRepo.find).toHaveBeenCalledWith({
                where: { parent: { id: 7 }, monthIssued: '2026-03' },
            });
        });

        it('respinge un părinte inexistent', async () => {
            profileRepo.findOne!.mockResolvedValue(null);
            await expect(service.calculateAmount(99, '2026-03')).rejects.toThrow(NotFoundException);
        });

        it('respinge un părinte fără copii', async () => {
            profileRepo.findOne!.mockResolvedValue(profileWithChildren(0));
            await expect(service.calculateAmount(1, '2026-03')).rejects.toThrow(NotFoundException);
        });

        // --- Bug cunoscut: nicio ramură pentru trei sau mai mulți copii. ---
        //
        // Testele de mai jos descriu comportamentul *dorit*, nu pe cel actual, exact cum cere
        // secțiunea „Riscuri" din E03: un test scris peste bug ar cimenta bug-ul.
        //
        // `it.failing` trece cât timp aserțiunea eșuează și devine roșu în clipa în care cineva
        // repară calculul — moment în care se șterge `.failing`. Deci CI rămâne verde, dar bug-ul
        // e documentat executabil, nu într-un comentariu pe care nu-l citește nimeni.
        //
        // Prețul definitiv se stabilește în E15 (700 lei per modul, −25% de la al doilea copil),
        // deci aici nu inventăm o formulă nouă: doar fixăm faptul că rezultatul nu are voie să fie
        // 0 sau negativ.

        it.failing('ar trebui să ceară ceva, nu 0, pentru trei copii', async () => {
            profileRepo.findOne!.mockResolvedValue(profileWithChildren(3));
            await expect(service.calculateAmount(1, '2026-03')).resolves.toBeGreaterThan(0);
        });

        it.failing('nu are voie să ceară o sumă negativă când există reduceri la trei copii', async () => {
            profileRepo.findOne!.mockResolvedValue(profileWithChildren(3));
            discountRepo.find!.mockResolvedValue([{ value: 50 }]);
            await expect(service.calculateAmount(1, '2026-03')).resolves.toBeGreaterThanOrEqual(0);
        });

        it('documentează comportamentul actual la trei copii: 0, iar cu reducere devine negativ', async () => {
            profileRepo.findOne!.mockResolvedValue(profileWithChildren(3));
            await expect(service.calculateAmount(1, '2026-03')).resolves.toBe(0);

            discountRepo.find!.mockResolvedValue([{ value: 50 }]);
            await expect(service.calculateAmount(1, '2026-03')).resolves.toBe(-50);
        });
    });

    describe('autorizare pe date', () => {
        it('findInvoices nu restrânge nimic pentru ADMIN', async () => {
            const qb = createMockQueryBuilder({ many: [] });
            invoiceRepo.createQueryBuilder!.mockReturnValue(qb);

            await service.findInvoices({}, Role.ADMIN, 42);

            expect(isScopedToUser(qb, 42)).toBe(false);
        });

        it('findInvoices restrânge la utilizatorul autentificat pentru PARENT', async () => {
            const qb = createMockQueryBuilder({ many: [] });
            invoiceRepo.createQueryBuilder!.mockReturnValue(qb);

            await service.findInvoices({}, Role.PARENT, 42);

            expect(isScopedToUser(qb, 42)).toBe(true);
        });

        it('findOne restrânge la utilizatorul autentificat pentru PARENT', async () => {
            const qb = createMockQueryBuilder({ one: { id: 1 } });
            invoiceRepo.createQueryBuilder!.mockReturnValue(qb);

            await service.findOne(1, Role.PARENT, 42);

            expect(isScopedToUser(qb, 42)).toBe(true);
        });

        it('findOne aruncă NotFound când factura e a altui părinte', async () => {
            // Interogarea restrânsă nu găsește nimic — părintele nu află că factura există.
            const qb = createMockQueryBuilder({ one: null });
            invoiceRepo.createQueryBuilder!.mockReturnValue(qb);

            await expect(service.findOne(1, Role.PARENT, 42)).rejects.toThrow(NotFoundException);
        });

        it('getInvoicePdf trece prin findOne, deci moștenește restrângerea', async () => {
            const qb = createMockQueryBuilder({ one: null });
            invoiceRepo.createQueryBuilder!.mockReturnValue(qb);

            await expect(service.getInvoicePdf(1, Role.PARENT, 42)).rejects.toThrow(NotFoundException);
        });
    });

    describe('createInvoice', () => {
        const setUpHappyPath = () => {
            profileRepo.findOne!.mockResolvedValue(profileWithChildren(1, 10));
            discountRepo.find!.mockResolvedValue([]);
            invoiceRepo.save!.mockImplementation((inv: { id?: number }) => Promise.resolve({ ...inv, id: 55 }));
        };

        it('emite câte o factură per părinte, cu suma calculată', async () => {
            setUpHappyPath();

            const created = await service.createInvoice({ parentIds: [10], monthIssued: '2026-03', dateIssued: '2026-03-01' });

            expect(created).toHaveLength(1);
            expect(invoiceRepo.save).toHaveBeenCalledWith(expect.objectContaining({ amount: 350, monthIssued: '2026-03', status: InvoiceStatus.PENDING }));
        });

        it('emite factura ca PENDING, nu ca plătită', async () => {
            setUpHappyPath();

            await service.createInvoice({ parentIds: [10], monthIssued: '2026-03', dateIssued: '2026-03-01' });

            expect((invoiceRepo.save!.mock.calls[0][0] as { status: InvoiceStatus }).status).toBe(InvoiceStatus.PENDING);
        });

        it('încarcă în S3 un PDF pe cale previzibilă, sub luna facturată', async () => {
            setUpHappyPath();

            await service.createInvoice({ parentIds: [10], monthIssued: '2026-03', dateIssued: '2026-03-01' });

            expect(s3.uploadFile).toHaveBeenCalledWith(expect.any(Buffer), expect.stringMatching(/^invoices\/2026-03\/.*\.pdf$/));
        });

        it('procesează mai mulți părinți într-o singură cerere', async () => {
            setUpHappyPath();

            const created = await service.createInvoice({
                parentIds: [10, 11],
                monthIssued: '2026-03',
                dateIssued: '2026-03-01',
            });

            expect(created).toHaveLength(2);
        });

        it('respinge un părinte inexistent înainte să salveze ceva', async () => {
            profileRepo.findOne!.mockResolvedValue(null);

            await expect(service.createInvoice({ parentIds: [99], monthIssued: '2026-03', dateIssued: '2026-03-01' })).rejects.toThrow(NotFoundException);

            expect(invoiceRepo.save).not.toHaveBeenCalled();
        });
    });

    describe('updateInvoice', () => {
        it('schimbă doar câmpurile trimise', async () => {
            const invoice = { id: 1, amount: 350, status: InvoiceStatus.PENDING, dateIssued: new Date('2026-03-01') };
            invoiceRepo.findOne!.mockResolvedValue(invoice);
            invoiceRepo.save!.mockImplementation((i: unknown) => Promise.resolve(i));

            await service.updateInvoice(1, { status: InvoiceStatus.PAID });

            expect(invoice.status).toBe(InvoiceStatus.PAID);
            expect(invoice.amount).toBe(350);
        });

        it('respinge o factură inexistentă', async () => {
            invoiceRepo.findOne!.mockResolvedValue(null);
            await expect(service.updateInvoice(99, { amount: 1 })).rejects.toThrow(NotFoundException);
        });
    });

    describe('deleteInvoice', () => {
        it('șterge factura existentă', async () => {
            invoiceRepo.findOne!.mockResolvedValue({ id: 1 });

            await service.deleteInvoice(1);

            expect(invoiceRepo.delete).toHaveBeenCalledWith(1);
        });

        it('respinge o factură inexistentă fără să șteargă nimic', async () => {
            invoiceRepo.findOne!.mockResolvedValue(null);

            await expect(service.deleteInvoice(99)).rejects.toThrow(NotFoundException);
            expect(invoiceRepo.delete).not.toHaveBeenCalled();
        });
    });

    describe('getPreview', () => {
        it('sare peste părinții pentru care calculul eșuează, în loc să cadă tot', async () => {
            profileRepo.findOne!.mockImplementation(({ where }: { where: { id: number } }) =>
                Promise.resolve(where.id === 1 ? profileWithChildren(1, 1) : null),
            );
            discountRepo.find!.mockResolvedValue([]);

            await expect(service.getPreview({ parentIds: [1, 99], monthIssued: '2026-03' })).resolves.toEqual([{ parentId: 1, amount: 350 }]);
        });
    });
});
