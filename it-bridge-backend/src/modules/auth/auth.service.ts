import { ConflictException, Injectable, UnauthorizedException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { RegisterDto } from 'src/common/dto/register.dto';
import { User } from 'src/entities/user.entity';
import { Repository } from 'typeorm';
import * as bcrypt from 'bcrypt';
import { LoginDto } from 'src/common/dto/login.dto';
import { JwtService } from '@nestjs/jwt';
import { RefreshTokenDto } from 'src/common/dto/refresh-token.dto';

@Injectable()
export class AuthService {
    constructor(
        @InjectRepository(User)
        private userRepository: Repository<User>,
        private jwtService: JwtService,
    ){}

    async register(registerDto: RegisterDto) {
        const preExistingUser = await this.userRepository.findOne({ where: [{ email: registerDto.email }, { phone: registerDto.phone }] }); 

        if (preExistingUser) {
            throw new ConflictException('User with given email or phone already exists');
        }


        const saltRounds = 10;
        const passwordHash = await bcrypt.hashSync(registerDto.password, saltRounds);

        const user = this.userRepository.create({
            email: registerDto.email,
            passwordHash: passwordHash,
            phone: registerDto.phone,
            role: 'PARENT',
        });
        await this.userRepository.save(user);
        const tokens = this.generateTokens(user.id, user.email, user.role);

        return { 
            accessToken: tokens.accessToken,
            refreshToken: tokens.refreshToken,
            message: 'User registered successfully' };
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

         const tokens = this.generateTokens(user.id, user.email, user.role);
         return { 
            accessToken: tokens.accessToken,
            refreshToken: tokens.refreshToken,
            message: 'Login successful' 
        };
    }

    async refreshToken(refreshTokenDto: RefreshTokenDto) {
        const refreshToken = refreshTokenDto.refreshToken;
        try {
            const payload = this.jwtService.verify(refreshToken, {
                secret: process.env.JWT_REFRESH_TOKEN_SECRET || 'defaultRefreshSecret',
            });
        
        } catch (e) {
            console.log(refreshToken);
            throw new UnauthorizedException('Invalid refresh token');
        }
        
        const payload = this.jwtService.decode(refreshToken) as { sub: number; };

        const user = await this.userRepository.findOne({ where: { id: payload.sub } });

        if (!user) {
            console.log("2");
            throw new UnauthorizedException('Invalid refresh token');
        }
        const accessTokenPayload = { sub: user.id, email: user.email, role: user.role };

        const newAccessToken = this.jwtService.sign(accessTokenPayload, {
            secret: process.env.JWT_ACCESS_TOKEN_SECRET || 'defaultAccessSecret',
            expiresIn: (process.env.JWT_ACCESS_TOKEN_EXPIRATION || 900) as number,
        });

        return {
            accessToken: newAccessToken,
            message: 'Token refreshed successfully',
        };
    }

    private generateTokens(userId: number, email: string, role: string) {
        const accessTokenPayload = { sub: userId, email, role };
        const refreshTokenPayload = { sub: userId };

        const accessToken = this.jwtService.sign(accessTokenPayload, {
            secret: process.env.JWT_ACCESS_TOKEN_SECRET || 'defaultAccessSecret',
            expiresIn: (process.env.JWT_ACCESS_TOKEN_EXPIRATION || 900) as number,
        });

        const refreshToken = this.jwtService.sign(refreshTokenPayload, {
            secret: process.env.JWT_REFRESH_TOKEN_SECRET || 'defaultRefreshSecret',
            expiresIn: (process.env.JWT_REFRESH_TOKEN_EXPIRATION || 604800) as number,
        });
        return {
        accessToken: accessToken,
        refreshToken: refreshToken,
    };
    }
}