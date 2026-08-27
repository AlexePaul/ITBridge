import { ConflictException, Injectable, UnauthorizedException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { RegisterDto } from 'src/modules/auth/dto/register.dto';
import { User } from 'src/entities/user.entity';
import { Repository } from 'typeorm';
import * as bcrypt from 'bcrypt';
import { randomUUID } from 'crypto';
import { LoginDto } from 'src/modules/auth/dto/login.dto';
import { JwtService } from '@nestjs/jwt';
import { RefreshTokenDto } from 'src/modules/auth/dto/refreshToken.dto';
import { jwtConstants } from 'src/constants/jwtConstants';
import { Role } from 'src/enum/role.enum';
import { SessionService } from './session.service';

@Injectable()
export class AuthService {
    constructor(
        @InjectRepository(User)
        private userRepository: Repository<User>,
        private jwtService: JwtService,
        private sessionService: SessionService,
    ) {}

    /** When a refresh token issued now stops being accepted. */
    private refreshExpiry(): Date {
        return new Date(Date.now() + jwtConstants.refreshTokenExpiration * 1000);
    }

    async register(registerDto: RegisterDto, userAgent?: string) {
        // Case-insensitive, and registration is public. Comparing exactly let anyone create
        // `Admin` and `ADMIN` alongside a real `admin`, which is an impersonation vector in a UI
        // that shows usernames — and inconsistent with every other lookup in the app, all of which
        // already compare with `lower()`.
        const preExistingUser = await this.userRepository
            .createQueryBuilder('user')
            .where('lower(user.username) = lower(:username)', { username: registerDto.username })
            .getOne();

        if (preExistingUser) {
            throw new ConflictException('A user with this username already exists');
        }

        const saltRounds = 10;
        const passwordHash = await bcrypt.hash(registerDto.password, saltRounds);

        const user = this.userRepository.create({
            username: registerDto.username,
            passwordHash: passwordHash,
            role: Role.PARENT,
        });
        await this.userRepository.save(user);
        const tokens = this.generateTokens(user.id, user.username, user.role);
        await this.sessionService.startSession(user, tokens.refreshToken, this.refreshExpiry(), userAgent);

        return {
            accessToken: tokens.accessToken,
            refreshToken: tokens.refreshToken,
            message: 'User registered successfully',
        };
    }

    async login(loginDto: LoginDto, userAgent?: string) {
        // Matched the same way registration checks for collisions, so the account you are stopped
        // from creating is the account you can sign in to.
        const user = await this.userRepository
            .createQueryBuilder('user')
            .where('lower(user.username) = lower(:username)', { username: loginDto.username })
            .getOne();

        if (!user) {
            throw new UnauthorizedException('Invalid credentials');
        }

        const isPasswordValid = await bcrypt.compare(loginDto.password, user.passwordHash);

        if (!isPasswordValid) {
            throw new UnauthorizedException('Invalid credentials');
        }

        const tokens = this.generateTokens(user.id, user.username, user.role);
        await this.sessionService.startSession(user, tokens.refreshToken, this.refreshExpiry(), userAgent);

        return {
            accessToken: tokens.accessToken,
            refreshToken: tokens.refreshToken,
            message: 'Login successful',
        };
    }

    async refreshToken(refreshTokenDto: RefreshTokenDto, userAgent?: string) {
        const refreshToken = refreshTokenDto.refreshToken;
        let payload: { sub: number };
        try {
            payload = this.jwtService.verify(refreshToken, {
                secret: jwtConstants.refreshTokenSecret,
            });
        } catch {
            throw new UnauthorizedException('Invalid refresh token');
        }

        const user = await this.userRepository.findOne({
            where: { id: payload.sub },
        });

        if (!user) {
            throw new UnauthorizedException('Invalid refresh token');
        }
        // Rotation: the presented token is consumed and replaced. A signature that verifies is no
        // longer enough — the token also has to be the live one for its session.
        const tokens = this.generateTokens(user.id, user.username, user.role);
        await this.sessionService.rotate(refreshToken, tokens.refreshToken, this.refreshExpiry(), userAgent);

        return {
            accessToken: tokens.accessToken,
            refreshToken: tokens.refreshToken,
            message: 'Token refreshed successfully',
        };
    }

    /** Real logout: the refresh token stops working immediately, rather than in seven days. */
    async logout(refreshToken: string): Promise<{ message: string }> {
        await this.sessionService.revoke(refreshToken);
        return { message: 'Logged out' };
    }

    async logoutEverywhere(userId: number): Promise<{ message: string }> {
        await this.sessionService.revokeAllForUser(userId);
        return { message: 'All sessions ended' };
    }

    async listSessions(userId: number) {
        return this.sessionService.listActive(userId);
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

        // `jti` is what makes two refresh tokens distinct. Without it the payload is just `{ sub }`
        // plus second-resolution `iat`/`exp`, so two logins within the same second produce a
        // byte-identical JWT — and the sessions table, which keys on the token hash, rejects the
        // second one as a duplicate.
        const refreshTokenPayload = { sub: userId, jti: randomUUID() };

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
