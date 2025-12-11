import { Injectable, UnauthorizedException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { RegisterDto } from 'src/common/dto/register.dto';
import { User } from 'src/entities/user.entity';
import { Repository } from 'typeorm';
import * as bcrypt from 'bcrypt';
import { LoginDto } from 'src/common/dto/login.dto';

@Injectable()
export class AuthService {
    constructor(
        @InjectRepository(User)
        private userRepository: Repository<User>
    ){}

    async register(registerDto: RegisterDto) {
        const saltRounds = 10;
        const passwordHash = await bcrypt.hashSync(registerDto.password, saltRounds);

        const user = this.userRepository.create({
            email: registerDto.email,
            passwordHash: passwordHash,
            phone: registerDto.phone,
            role: 'PARENT',
        });
        await this.userRepository.save(user);
        return { message: 'User registered successfully' };
    }

    async login(loginDto: LoginDto) {
       const user = await this.userRepository.findOne({ where: { email: loginDto.email } });

         if (!user) {
            throw new UnauthorizedException('Invalid credentials');
         }

         const isPasswordValid = await bcrypt.compare(loginDto.password, user.passwordHash);
         
         if (!isPasswordValid) {
            throw new UnauthorizedException('Invalid credentials');
         }
         return { message: 'Login successful' };
    }
}
