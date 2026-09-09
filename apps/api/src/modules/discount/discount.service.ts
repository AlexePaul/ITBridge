import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import { DataSource, EntityManager, Repository } from 'typeorm';
import { Discount } from 'src/entities/discount.entity';
import { Profile } from 'src/entities/profile.entity';
import { CreateDiscountDto } from './dto/createDiscount.dto';
import { UpdateDiscountDto } from './dto/updateDiscount.dto';
import { applyDefined } from 'src/common/apply-defined';
import { DiscountType } from 'src/enum/discount-type.enum';
import { REFERRAL_DISCOUNT_NAME, REFERRAL_PERCENT, nextBillingMonthAt, nextUncoveredMonth, type ReferralReward } from './discount.rules';
import { AuditService, type Actor } from 'src/modules/audit/audit.service';
import { snapshotFields } from 'src/modules/audit/audit.rules';
import { AuditAction } from 'src/enum/audit-action.enum';

/**
 * The fields of a discount worth a line in the trail — E07/S3.
 *
 * All four, because all four decide what the family is charged: a `fixed` 50 and a `percent` 50 are
 * different money, and the month says which invoice it lands on. The parent is who the entry is
 * about, carried by the row it points at rather than copied into the log.
 */
const AUDITED_DISCOUNT_FIELDS = ['name', 'type', 'value', 'monthIssued'];

function auditableDiscount(discount: Discount): Record<string, unknown> {
    return { name: discount.name, type: discount.type, value: discount.value, monthIssued: discount.monthIssued };
}

@Injectable()
export class DiscountService {
    constructor(
        @InjectRepository(Discount) private discountRepository: Repository<Discount>,
        @InjectRepository(Profile) private profileRepository: Repository<Profile>,
        @InjectDataSource() private readonly dataSource: DataSource,
        private readonly audit: AuditService,
    ) {}

    /**
     * One row of the trail for a discount that appeared or went away, with the note that says which
     * family it was for — the id alone is unreadable once the row is gone.
     */
    private async recordDiscount(discount: Discount, parentId: number | null, action: AuditAction, actor: Actor, manager: EntityManager): Promise<void> {
        await this.audit.record(
            {
                actor,
                action,
                entityType: 'Discount',
                entityId: discount.id,
                changes: snapshotFields(auditableDiscount(discount), action === AuditAction.CREATED ? 'created' : 'deleted'),
                // No family, no note: `familia 0` would name a profile that does not exist.
                note: parentId === null ? null : `familia ${parentId}`,
            },
            manager,
        );
    }

    async createDiscount(createDiscountDto: CreateDiscountDto, actor: Actor): Promise<Discount> {
        this.assertWithinBounds(createDiscountDto.type ?? DiscountType.FIXED, createDiscountDto.value);

        const discount = this.discountRepository.create(createDiscountDto);
        // Only the id is set: TypeORM writes the foreign key without loading the whole profile.
        discount.parent = { id: createDiscountDto.parentId } as Profile;

        return this.dataSource.transaction(async (manager) => {
            const saved = await manager.save(Discount, discount);
            await this.recordDiscount(saved, createDiscountDto.parentId, AuditAction.CREATED, actor, manager);
            return saved;
        });
    }

    /**
     * Every discount, newest month first, with the family attached.
     *
     * The relation is loaded because a discount is unreadable without it — a screen listing "50%,
     * Recomandare, 2026-03" with no name beside it is a list of amounts, not of decisions. Only
     * the name comes over: `ProfileSummary` is what the wire carries.
     */
    async findDiscounts(): Promise<Discount[]> {
        return await this.discountRepository
            .createQueryBuilder('discount')
            .leftJoin('discount.parent', 'parent')
            .addSelect(['parent.id', 'parent.firstName', 'parent.lastName'])
            .orderBy('discount.monthIssued', 'DESC')
            .addOrderBy('discount.id', 'DESC')
            .getMany();
    }

    /**
     * The months the referral reward currently covers for one family — E20/S5.
     *
     * Only months from the next one onwards. The reward is a promise about invoices not yet
     * issued, and a button that could take half off a month already billed would be a correction,
     * not a reward — corrections are the form's job, where somebody has to mean it.
     */
    async referralReward(parentId: number, now: Date = new Date()): Promise<ReferralReward> {
        await this.assertParentExists(parentId);
        return { parentId, months: await this.coveredMonths(parentId, nextBillingMonthAt(now)) };
    }

    /**
     * One more month at half price — E20/S5, the `+` press.
     *
     * The first press lands on next month; each one after it lands on the month after the last one
     * covered, so pressing three times is three months at 50% and not 150% off one. That is the
     * distinction the whole design turns on: **a second referral earns a second month, never a
     * deeper cut**, because percentages add up against the list price and two of them on one month
     * make it free — and a free month produced by a double-click reads exactly like a free month
     * somebody decided on.
     *
     * A percentage on the landing month that is **not** this reward still refuses: a hand-typed
     * 50% plus this one costs the school the same as two of ours. That case is deliberate by
     * definition, so it belongs in the form, where it takes deciding rather than clicking.
     *
     * No database constraint behind the check, unlike the seat rules in E11: two admins pressing in
     * the same second leave a duplicate row that is visible on `/admin/reduceri` and deletable in
     * two clicks, which is not the class of damage an index is for.
     */
    async grantReferralMonth(parentId: number, actor: Actor, now: Date = new Date()): Promise<ReferralReward> {
        await this.assertParentExists(parentId);

        const from = nextBillingMonthAt(now);
        const covered = await this.coveredMonths(parentId, from);
        const monthIssued = nextUncoveredMonth(from, covered);

        const clash = await this.discountRepository.findOne({
            where: { parent: { id: parentId }, monthIssued, type: DiscountType.PERCENT },
        });
        if (clash) {
            throw new ConflictException({
                message: `Familia are deja o reducere procentuală pe ${monthIssued}, dată de altcineva decât butonul. Două se adună și fac luna gratuită.`,
                error: 'DISCOUNT_ALREADY_GRANTED',
            });
        }

        await this.dataSource.transaction(async (manager) => {
            const saved = await manager.save(
                Discount,
                this.discountRepository.create({
                    name: REFERRAL_DISCOUNT_NAME,
                    type: DiscountType.PERCENT,
                    value: REFERRAL_PERCENT,
                    monthIssued,
                    parent: { id: parentId } as Profile,
                }),
            );
            // Half a month off is money, and a button is the easiest way for it to be given twice
            // by accident — so who pressed it, and for which month, is written down.
            await this.recordDiscount(saved, parentId, AuditAction.CREATED, actor, manager);
        });

        return { parentId, months: [...covered, monthIssued].sort() };
    }

    /**
     * One month fewer — E20/S5, the `−` press.
     *
     * Takes the **last** month off the run, so the two buttons undo each other: three presses up
     * and one down leave two months, and the one that goes is always the one furthest from being
     * invoiced. Months already past the window are never touched, for the same reason `+` cannot
     * reach them.
     *
     * Removes only this reward's own rows. A percentage somebody typed by hand is not ours to
     * withdraw from a button that says "recomandare", and deleting it here would make the `−` press
     * mean something different depending on what the family happened to have.
     */
    async revokeReferralMonth(parentId: number, actor: Actor, now: Date = new Date()): Promise<ReferralReward> {
        await this.assertParentExists(parentId);

        const from = nextBillingMonthAt(now);
        const covered = await this.coveredMonths(parentId, from);
        const last = covered[covered.length - 1];
        if (!last) {
            throw new ConflictException({
                message: 'Familia nu are nicio lună de recomandare de scos.',
                error: 'REFERRAL_NOTHING_TO_REVOKE',
            });
        }

        const row = await this.discountRepository.findOne({
            where: {
                parent: { id: parentId },
                monthIssued: last,
                name: REFERRAL_DISCOUNT_NAME,
                type: DiscountType.PERCENT,
            },
        });
        if (row) {
            await this.dataSource.transaction(async (manager) => {
                await manager.delete(Discount, row.id);
                await this.recordDiscount(row, parentId, AuditAction.DELETED, actor, manager);
            });
        }

        return { parentId, months: covered.slice(0, -1) };
    }

    /** The reward's own months, from `from` onwards, in order. Sorted as text: `YYYY-MM` allows it. */
    private async coveredMonths(parentId: number, from: string): Promise<string[]> {
        const rows = await this.discountRepository.find({
            where: {
                parent: { id: parentId },
                name: REFERRAL_DISCOUNT_NAME,
                type: DiscountType.PERCENT,
            },
        });

        return rows
            .map((row) => row.monthIssued)
            .filter((month) => month >= from)
            .sort();
    }

    private async assertParentExists(parentId: number): Promise<void> {
        const parent = await this.profileRepository.findOne({ where: { id: parentId } });
        if (!parent) {
            throw new NotFoundException('Profile not found');
        }
    }

    async updateDiscount(id: number, updateDiscountDto: UpdateDiscountDto, actor: Actor): Promise<Discount> {
        // **Without the parent relation**, deliberately. The row this loads is the one that goes
        // back over the wire, and `Profile` carries the family's email, phone and address — loading
        // it for the sake of a note on a log entry would publish all three to whoever pressed save.
        // The entry points at the discount, which still exists after an edit; only the deletion,
        // where nothing is left to look up, earns a note naming the family.
        const discount = await this.discountRepository.findOne({ where: { id } });
        if (!discount) {
            throw new NotFoundException('Discount not found');
        }

        // Read before the merge overwrites it — after `applyDefined` there is nothing left to
        // compare against and every diff would come out empty.
        const before = auditableDiscount(discount);

        // Only the fields actually sent are overwritten; `undefined` leaves the current value alone.
        applyDefined(discount, updateDiscountDto);
        // Checked after the merge, not before: an update may send the type without the value, or
        // the other way round, and only the merged row says what will actually be stored. A `fixed`
        // 200 turned into a `percent` by a later request is the case a per-payload check misses.
        this.assertWithinBounds(discount.type, discount.value);

        return this.dataSource.transaction(async (manager) => {
            const saved = await manager.save(Discount, discount);
            await this.audit.recordUpdate(
                {
                    actor,
                    entityType: 'Discount',
                    entityId: saved.id,
                    before,
                    after: auditableDiscount(saved),
                    fields: AUDITED_DISCOUNT_FIELDS,
                },
                manager,
            );
            return saved;
        });
    }

    async deleteDiscount(id: number, actor: Actor): Promise<void> {
        const discount = await this.discountRepository.findOne({ where: { id }, relations: { parent: true } });
        // Nothing on file is not an act. `delete` on a missing id has always answered without
        // complaint, and an entry for it would claim somebody withdrew a discount that never was.
        if (!discount) return;

        await this.dataSource.transaction(async (manager) => {
            await manager.delete(Discount, id);
            await this.recordDiscount(discount, discount.parent?.id ?? null, AuditAction.DELETED, actor, manager);
        });
    }

    /**
     * A percentage cannot exceed 100 — E15/S5's acceptance criterion.
     *
     * Worth a guard rather than trusting the arithmetic, because the failure is invisible: a 200%
     * discount would take the invoice past zero, the floor in `pricing.ts` would clamp it back to
     * zero, and the only symptom anybody would ever see is a month that cost nothing for no stated
     * reason. A fixed amount has no upper bound — a 5000 lei goodwill adjustment is a decision, not
     * a typo the platform should second-guess — and the floor is what keeps it harmless.
     */
    private assertWithinBounds(type: DiscountType, value: number): void {
        if (type === DiscountType.PERCENT && value > 100) {
            throw new BadRequestException({
                message: 'O reducere procentuală nu poate depăși 100%.',
                error: 'DISCOUNT_PERCENT_OVER_100',
            });
        }
    }
}
