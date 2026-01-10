import { Injectable } from '@nestjs/common';
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
        await this.discountRepository.update(id, updateDiscountDto);
        return this.discountRepository.findOne({ where: { id } });
    }

    async deleteDiscount(id: number) {
        await this.discountRepository.delete(id);
    }
}
