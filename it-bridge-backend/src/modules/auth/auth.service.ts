import {
  ConflictException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
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
      where: [{ email: registerDto.email }, { phone: registerDto.phone }],
    });

    if (preExistingUser) {
      throw new ConflictException(
        'User with given email or phone already exists',
      );
    }

    const saltRounds = 10;
    const passwordHash = await bcrypt.hashSync(
      registerDto.password,
      saltRounds,
    );

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
      message: 'User registered successfully',
    };
  }

  async login(loginDto: LoginDto) {
    const user = await this.userRepository.findOne({
      where: { email: loginDto.email },
    });

    if (!user) {
      throw new UnauthorizedException('Invalid credentials');
    }

    const isPasswordValid = await bcrypt.compare(
      loginDto.password,
      user.passwordHash,
    );

    if (!isPasswordValid) {
      throw new UnauthorizedException('Invalid credentials');
    }

    const tokens = this.generateTokens(user.id, user.email, user.role);
    return {
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
      message: 'Login successful',
    };
  }

  async refreshToken(refreshTokenDto: RefreshTokenDto) {
    const refreshToken = refreshTokenDto.refreshToken;
    try {
      const payload = this.jwtService.verify(refreshToken, {
        secret: jwtConstants.refreshTokenSecret,
      });
    } catch (e) {
      console.log(refreshToken);
      throw new UnauthorizedException('Invalid refresh token');
    }

    const payload = this.jwtService.decode(refreshToken) as { sub: number };

    const user = await this.userRepository.findOne({
      where: { id: payload.sub },
    });

    if (!user) {
      console.log('2');
      throw new UnauthorizedException('Invalid refresh token');
    }
    const accessTokenPayload = {
      sub: user.id,
      email: user.email,
      role: user.role,
    };

    const newAccessToken = this.jwtService.sign(accessTokenPayload, {
      secret: jwtConstants.acessTokenSecret,
      expiresIn: jwtConstants.acessTokenExpiration,
    });

    return {
      accessToken: newAccessToken,
      message: 'Token refreshed successfully',
    };
  }

  async getUserProfile(userId: number) {
    const user = await this.userRepository.findOne({
      where: { id: userId },
      select: ['id', 'email', 'phone', 'role', 'createdAt'],
    });
    return user;
  }

  private generateTokens(userId: number, email: string, role: string) {
    const accessTokenPayload = { sub: userId, email, role };
    const refreshTokenPayload = { sub: userId };

    const accessToken = this.jwtService.sign(accessTokenPayload, {
      secret: jwtConstants.acessTokenSecret,
      expiresIn: jwtConstants.acessTokenExpiration,
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
