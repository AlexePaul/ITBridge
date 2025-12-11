import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { User } from 'src/entities/user.entity';
import { Repository } from 'typeorm';

@Injectable()
export class AuthService {
    constructor(
        @InjectRepository(User)
        private userRepository: Repository<User>
    ){}

    register() {
        // Registration logic here
        return { message: 'User registered successfully' };
    }

    login() {
        // Login logic here
        return { message: 'User logged in successfully' };
    }
}
