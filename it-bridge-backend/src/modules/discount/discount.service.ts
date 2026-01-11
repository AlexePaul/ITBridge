import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Discount } from 'src/entities/discount.entity';

@Injectable()
export class DiscountService {
    constructor(@InjectRepository(Discount) private discountRepository) {}

    async createDiscount(createDiscountDto) {
        const discount = this.discountRepository.create(createDiscountDto);
        discount.parent = { id: createDiscountDto.parentId };
        return this.discountRepository.save(discount);
    }

    async findDiscounts() {
        return this.discountRepository.find();
    }

    async updateDiscount(id: number, updateDiscountDto) {
        let discount = await this.discountRepository.findOne({ where: { id } });
        if (!discount) {
            throw new NotFoundException('Discount not found');
        }

        Object.entries(updateDiscountDto).forEach(([key, value]) => {
            if (value !== undefined) {
                discount[key] = value;
            }
        });

        return this.discountRepository.save(discount);
    }

    async deleteDiscount(id: number) {
        await this.discountRepository.delete(id);
    }
}
