import { Controller, Post, Body, Get, UseGuards, Request, HttpCode, Headers } from '@nestjs/common';
import { ApiResponse, ApiBearerAuth } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { AuthService } from './auth.service';
import { RegisterDto } from 'src/modules/auth/dto/register.dto';
import { LoginDto } from 'src/modules/auth/dto/login.dto';
import { RefreshTokenDto } from 'src/modules/auth/dto/refreshToken.dto';
import { AcceptDocumentsDto } from 'src/modules/auth/dto/accept-documents.dto';
import { ConfirmEmailDto } from 'src/modules/auth/dto/confirm-email.dto';
import { ForgotPasswordDto } from 'src/modules/auth/dto/forgotPassword.dto';
import { ResetPasswordDto } from 'src/modules/auth/dto/resetPassword.dto';
import { ChangePasswordDto } from 'src/modules/auth/dto/changePassword.dto';
import { PasswordResetService } from './password-reset.service';
import { AuthGuard } from 'src/guards/auth.guard';
import type { AuthenticatedRequest } from 'src/types/authenticated-request';

@Controller('auth')
export class AuthController {
    constructor(
        private readonly authService: AuthService,
        private readonly passwordResets: PasswordResetService,
    ) {}

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

    /**
     * "I forgot my password" — the address, and nothing else.
     *
     * Public by necessity: the whole point is that the parent cannot sign in. Three a minute, the
     * same as `resend-confirmation` and for the same two reasons — a parent who did not get the
     * first mail presses again, and anything past that is somebody using the school's sending quota
     * to post mail at a third party.
     *
     * **Always 200, whatever was found.** The response says a link was sent if the address is known,
     * because saying anything else turns the form into a way of asking "is ana@example.com a parent
     * at this school", which is a question about a child. The service is silent for the same reason.
     */
    @Throttle({ default: { ttl: 60_000, limit: 3 } })
    @Post('forgot-password')
    @HttpCode(200)
    @ApiResponse({ status: 200, description: 'If the address has an account, a reset link was queued' })
    async forgotPassword(@Body() forgotPasswordDto: ForgotPasswordDto) {
        await this.passwordResets.request(forgotPasswordDto.email);
        return { message: 'Dacă adresa are un cont, am trimis un link de resetare.' };
    }

    /**
     * The link's token, and the new password.
     *
     * Public for the same reason `confirm-email` is: the token is the credential, and requiring the
     * account it unlocks would be a circle. Throttled at ten a minute like that one — this is the
     * other place in the app where a public route takes a bearer secret, so it is the other place
     * guessing has a target.
     */
    @Throttle({ default: { ttl: 60_000, limit: 10 } })
    @Post('reset-password')
    @HttpCode(200)
    @ApiResponse({ status: 200, description: 'The password was changed and every session revoked' })
    @ApiResponse({ status: 400, description: 'Token unknown, expired, already used, or issued to an address the account no longer has' })
    async resetPassword(@Body() resetPasswordDto: ResetPasswordDto) {
        await this.passwordResets.reset(resetPasswordDto.token, resetPasswordDto.password);
        return { message: 'Parola a fost schimbată. Autentifică-te cu parola nouă.' };
    }

    /**
     * Changing the password from inside the account, current password required.
     *
     * Guarded, and still asks for the old password: `AuthGuard` checks a signature and nothing else,
     * so a tab left open on a shared machine is enough to reach this. See `ChangePasswordDto`.
     */
    @Throttle({ default: { ttl: 60_000, limit: 5 } })
    @Post('change-password')
    @HttpCode(200)
    @ApiBearerAuth()
    @UseGuards(AuthGuard)
    @ApiResponse({ status: 200, description: 'The password was changed and every session revoked' })
    @ApiResponse({ status: 400, description: 'The current password is wrong' })
    async changePassword(@Request() req: AuthenticatedRequest, @Body() changePasswordDto: ChangePasswordDto) {
        await this.passwordResets.change(req.user.sub, changePasswordDto.currentPassword, changePasswordDto.newPassword);
        return { message: 'Parola a fost schimbată. Autentifică-te din nou.' };
    }

    @Throttle({ default: { ttl: 60_000, limit: 20 } })
    @Post('refresh')
    @HttpCode(200)
    @ApiResponse({ status: 200, description: 'Token refreshed successfully' })
    @ApiResponse({ status: 401, description: 'Invalid refresh token' })
    async refresh(@Body() refreshTokenDTO: RefreshTokenDto, @Headers('user-agent') userAgent?: string) {
        return this.authService.refreshToken(refreshTokenDTO, userAgent);
    }

    /**
     * Records that the caller accepts the documents named in the body — E22 S4, second half.
     *
     * A parent write, and the narrowest kind: it takes no id, so the rows land on the account in
     * the token and nowhere else, and it can only ever add to that account's own ledger. There is
     * no route that removes one.
     */
    @Post('accept-documents')
    @HttpCode(200)
    @ApiBearerAuth()
    @UseGuards(AuthGuard)
    @ApiResponse({ status: 200, description: 'The acceptances were recorded; nothing is outstanding' })
    @ApiResponse({ status: 400, description: 'The list leaves a required document unaccepted' })
    async acceptDocuments(@Request() req: AuthenticatedRequest, @Body() acceptDocumentsDto: AcceptDocumentsDto) {
        return this.authService.acceptDocuments(req.user.sub, acceptDocumentsDto);
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
