import { ConflictException, Injectable, UnauthorizedException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { RegisterDto } from 'src/modules/auth/dto/register.dto';
import { User } from 'src/entities/user.entity';
import { Repository } from 'typeorm';
import * as bcrypt from 'bcrypt';
import { LoginDto } from 'src/modules/auth/dto/login.dto';
import { JwtService } from '@nestjs/jwt';
import { RefreshTokenDto } from 'src/modules/auth/dto/refreshToken.dto';
import { jwtConstants } from 'src/constants/jwtConstants';

@Injectable()
export class AuthService {
    constructor(
        @InjectRepository(User)
        private userRepository: Repository<User>,
        private jwtService: JwtService,
    ) {}

    async register(registerDto: RegisterDto) {
        const preExistingUser = await this.userRepository.findOne({
            where: { username: registerDto.username },
        });

        if (preExistingUser) {
            throw new ConflictException('User with given email or phone already exists');
        }

        const saltRounds = 10;
        const passwordHash = await bcrypt.hash(registerDto.password, saltRounds);

        const user = this.userRepository.create({
            username: registerDto.username,
            passwordHash: passwordHash,
            role: 'PARENT',
        });
        await this.userRepository.save(user);
        const tokens = this.generateTokens(user.id, user.username, user.role);

        return {
            accessToken: tokens.accessToken,
            refreshToken: tokens.refreshToken,
            message: 'User registered successfully',
        };
    }

    async login(loginDto: LoginDto) {
        const user = await this.userRepository.findOne({
            where: { username: loginDto.username },
        });

        if (!user) {
            throw new UnauthorizedException('Invalid credentials');
        }

        const isPasswordValid = await bcrypt.compare(loginDto.password, user.passwordHash);

        if (!isPasswordValid) {
            throw new UnauthorizedException('Invalid credentials');
        }

        const tokens = this.generateTokens(user.id, user.username, user.role);
        return {
            accessToken: tokens.accessToken,
            refreshToken: tokens.refreshToken,
            message: 'Login successful',
        };
    }

    async refreshToken(refreshTokenDto: RefreshTokenDto) {
        const refreshToken = refreshTokenDto.refreshToken;
        let payload: { sub: number };
        try {
            payload = this.jwtService.verify(refreshToken, {
                secret: jwtConstants.refreshTokenSecret,
            }) as { sub: number };
        } catch (e) {
            throw new UnauthorizedException('Invalid refresh token');
        }

        const user = await this.userRepository.findOne({
            where: { id: payload.sub },
        });

        if (!user) {
            throw new UnauthorizedException('Invalid refresh token');
        }
        const accessTokenPayload = {
            sub: user.id,
            username: user.username,
            role: user.role,
        };

        const newAccessToken = this.jwtService.sign(accessTokenPayload, {
            secret: jwtConstants.accessTokenSecret,
            expiresIn: jwtConstants.accessTokenExpiration,
        });

        return {
            accessToken: newAccessToken,
            message: 'Token refreshed successfully',
        };
    }

    async getUserProfile(userId: number) {
        const user = await this.userRepository.findOne({
            where: { id: userId },
            select: ['id', 'username', 'role', 'createdAt'],
        });
        return user;
    }

    private generateTokens(userId: number, username: string, role: string) {
        const accessTokenPayload = { sub: userId, username, role };
        const refreshTokenPayload = { sub: userId };

        const accessToken = this.jwtService.sign(accessTokenPayload, {
            secret: jwtConstants.accessTokenSecret,
            expiresIn: jwtConstants.accessTokenExpiration,
        });

        const refreshToken = this.jwtService.sign(refreshTokenPayload, {
            secret: jwtConstants.refreshTokenSecret,
            expiresIn: jwtConstants.refreshTokenExpiration,
        });
        return {
            accessToken: accessToken,
            refreshToken: refreshToken,
        };
    }
}
