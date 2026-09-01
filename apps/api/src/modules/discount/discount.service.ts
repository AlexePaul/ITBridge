import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Discount } from 'src/entities/discount.entity';
import { Profile } from 'src/entities/profile.entity';
import { CreateDiscountDto } from './dto/createDiscount.dto';
import { UpdateDiscountDto } from './dto/updateDiscount.dto';
import { applyDefined } from 'src/common/apply-defined';
import { DiscountType } from 'src/enum/discount-type.enum';

@Injectable()
export class DiscountService {
    constructor(@InjectRepository(Discount) private discountRepository: Repository<Discount>) {}

    async createDiscount(createDiscountDto: CreateDiscountDto): Promise<Discount> {
        this.assertWithinBounds(createDiscountDto.type ?? DiscountType.FIXED, createDiscountDto.value);

        const discount = this.discountRepository.create(createDiscountDto);
        // Only the id is set: TypeORM writes the foreign key without loading the whole profile.
        discount.parent = { id: createDiscountDto.parentId } as Profile;
        return await this.discountRepository.save(discount);
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

    async updateDiscount(id: number, updateDiscountDto: UpdateDiscountDto): Promise<Discount> {
        const discount = await this.discountRepository.findOne({ where: { id } });
        if (!discount) {
            throw new NotFoundException('Discount not found');
        }

        // Only the fields actually sent are overwritten; `undefined` leaves the current value alone.
        applyDefined(discount, updateDiscountDto);
        // Checked after the merge, not before: an update may send the type without the value, or
        // the other way round, and only the merged row says what will actually be stored. A `fixed`
        // 200 turned into a `percent` by a later request is the case a per-payload check misses.
        this.assertWithinBounds(discount.type, discount.value);

        return await this.discountRepository.save(discount);
    }

    async deleteDiscount(id: number): Promise<void> {
        await this.discountRepository.delete(id);
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
