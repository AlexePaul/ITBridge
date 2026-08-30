import { Controller, Post, Body, Get, UseGuards, Request, HttpCode, Headers } from '@nestjs/common';
import { ApiResponse, ApiBearerAuth } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { AuthService } from './auth.service';
import { RegisterDto } from 'src/modules/auth/dto/register.dto';
import { LoginDto } from 'src/modules/auth/dto/login.dto';
import { RefreshTokenDto } from 'src/modules/auth/dto/refreshToken.dto';
import { ConfirmEmailDto } from 'src/modules/auth/dto/confirm-email.dto';
import { AuthGuard } from 'src/guards/auth.guard';
import type { AuthenticatedRequest } from 'src/types/authenticated-request';

@Controller('auth')
export class AuthController {
    constructor(private readonly authService: AuthService) {}

    @Throttle({ default: { ttl: 60_000, limit: 10 } })
    @Post('login')
    @HttpCode(200)
    @ApiResponse({ status: 200, description: 'Login successful' })
    @ApiResponse({ status: 401, description: 'Invalid credentials' })
    async login(@Body() loginDto: LoginDto, @Headers('user-agent') userAgent?: string) {
        return this.authService.login(loginDto, userAgent);
    }

    @Throttle({ default: { ttl: 60_000, limit: 5 } })
    @Post('register')
    @ApiResponse({ status: 201, description: 'User registered successfully' })
    @ApiResponse({
        status: 409,
        description: 'User with given email or phone already exists',
    })
    async register(@Body() registerDto: RegisterDto, @Headers('user-agent') userAgent?: string) {
        return this.authService.register(registerDto, userAgent);
    }

    /**
     * The link from the confirmation mail lands here — E11/S2, the first gate.
     *
     * No guard, deliberately: the parent may open the link on a phone that has never signed in, and
     * a gate that required the account it unlocks would be a circle. The token is the credential,
     * as it is on `logout`.
     *
     * Throttled harder than login. The endpoint is public and takes a bearer secret, so it is the
     * one place in the app where guessing has a target; ten a minute leaves no room for that and
     * plenty for a parent clicking twice.
     */
    @Throttle({ default: { ttl: 60_000, limit: 10 } })
    @Post('confirm-email')
    @HttpCode(200)
    @ApiResponse({ status: 200, description: 'Email address confirmed' })
    @ApiResponse({ status: 400, description: 'Token missing, expired, already used or unknown' })
    async confirmEmail(@Body() confirmEmailDto: ConfirmEmailDto) {
        return this.authService.confirmEmail(confirmEmailDto.token);
    }

    /**
     * A new link, to the address already on file — never to one supplied in the request.
     *
     * Three a minute: a parent who did not get the first mail will press this twice, and anything
     * beyond that is somebody using the school's sending quota as a way to mail a third party.
     */
    @Throttle({ default: { ttl: 60_000, limit: 3 } })
    @Post('resend-confirmation')
    @HttpCode(200)
    @ApiBearerAuth()
    @UseGuards(AuthGuard)
    @ApiResponse({ status: 200, description: 'A fresh confirmation link was queued' })
    @ApiResponse({ status: 400, description: 'Already confirmed, or no address on file' })
    async resendConfirmation(@Request() req: AuthenticatedRequest) {
        return this.authService.resendConfirmation(req.user.sub);
    }

    @Throttle({ default: { ttl: 60_000, limit: 20 } })
    @Post('refresh')
    @HttpCode(200)
    @ApiResponse({ status: 200, description: 'Token refreshed successfully' })
    @ApiResponse({ status: 401, description: 'Invalid refresh token' })
    async refresh(@Body() refreshTokenDTO: RefreshTokenDto, @Headers('user-agent') userAgent?: string) {
        return this.authService.refreshToken(refreshTokenDTO, userAgent);
    }

    @Get('me')
    @HttpCode(200)
    @ApiResponse({
        status: 200,
        description: 'Returns the authenticated user details',
    })
    @ApiResponse({ status: 401, description: 'Unauthorized' })
    @ApiBearerAuth()
    @UseGuards(AuthGuard)
    async getProfile(@Request() req: AuthenticatedRequest) {
        return this.authService.getUserProfile(req.user.sub);
    }

    @Post('logout')
    @HttpCode(200)
    @ApiResponse({ status: 200, description: 'Refresh token revoked' })
    async logout(@Body() refreshTokenDTO: RefreshTokenDto) {
        // No guard: an access token may already have expired, and logging out has to work anyway.
        // The refresh token is the credential here, and revoking an unknown one is a no-op.
        return this.authService.logout(refreshTokenDTO.refreshToken);
    }

    @Post('logout-all')
    @HttpCode(200)
    @ApiBearerAuth()
    @UseGuards(AuthGuard)
    @ApiResponse({ status: 200, description: 'Every session of this user revoked' })
    async logoutEverywhere(@Request() req: AuthenticatedRequest) {
        return this.authService.logoutEverywhere(req.user.sub);
    }

    @Get('sessions')
    @ApiBearerAuth()
    @UseGuards(AuthGuard)
    @ApiResponse({ status: 200, description: 'Active sessions of the authenticated user' })
    async sessions(@Request() req: AuthenticatedRequest) {
        return this.authService.listSessions(req.user.sub);
    }
}
