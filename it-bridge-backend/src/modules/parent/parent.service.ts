import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Parent } from 'src/entities/parent.entity';
import { In, Repository } from 'typeorm';

@Injectable()
export class ParentService {
    constructor(@InjectRepository(Parent) private parentRepository: Repository<Parent>) {}
}
