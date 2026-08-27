import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Discount } from 'src/entities/discount.entity';
import { Profile } from 'src/entities/profile.entity';
import { CreateDiscountDto } from './dto/createDiscount.dto';
import { UpdateDiscountDto } from './dto/updateDiscount.dto';
import { applyDefined } from 'src/common/apply-defined';

@Injectable()
export class DiscountService {
    constructor(@InjectRepository(Discount) private discountRepository: Repository<Discount>) {}

    async createDiscount(createDiscountDto: CreateDiscountDto): Promise<Discount> {
        const discount = this.discountRepository.create(createDiscountDto);
        // Only the id is set: TypeORM writes the foreign key without loading the whole profile.
        discount.parent = { id: createDiscountDto.parentId } as Profile;
        return await this.discountRepository.save(discount);
    }

    async findDiscounts(): Promise<Discount[]> {
        return await this.discountRepository.find();
    }

    async updateDiscount(id: number, updateDiscountDto: UpdateDiscountDto): Promise<Discount> {
        const discount = await this.discountRepository.findOne({ where: { id } });
        if (!discount) {
            throw new NotFoundException('Discount not found');
        }

        // Only the fields actually sent are overwritten; `undefined` leaves the current value alone.
        applyDefined(discount, updateDiscountDto);

        return await this.discountRepository.save(discount);
    }

    async deleteDiscount(id: number): Promise<void> {
        await this.discountRepository.delete(id);
    }
}
