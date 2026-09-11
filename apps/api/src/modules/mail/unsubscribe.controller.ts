import { Body, Controller, HttpCode, Post } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { ApiOperation, ApiResponse } from '@nestjs/swagger';
import { UnsubscribeService } from './unsubscribe.service';
import { UnsubscribeDto } from './dto/unsubscribe.dto';

/**
 * The way out of marketing, from inside a marketing message — E17 S4.
 *
 * **Public, and it has to be.** A parent reading a newsletter on a phone is not signed in, and
 * Legea 506/2004 art. 12 asks that refusing be possible from the message; GDPR art. 7 alin. 3 asks
 * that it be no harder than consenting was. A route behind a login would be harder than the
 * checkbox that granted it. Listed by name in `authorization.spec.ts`, like the trial booking.
 *
 * **`POST`, never `GET`.** The link in the e-mail opens a page; the page posts. Mail clients,
 * scanners and preview bots fetch links without a human, so a `GET` that unsubscribed on sight
 * would silently opt families out of something they never refused — and the evidence would be
 * indistinguishable from them refusing.
 */
@Controller('marketing')
export class UnsubscribeController {
    constructor(private readonly unsubscribeService: UnsubscribeService) {}

    /**
     * Always 200, whatever the token was. See `UnsubscribeService`: an answer that told a caller
     * whether a token exists is an oracle for finding ones that do.
     */
    @Throttle({ default: { ttl: 60_000, limit: 10 } })
    @Post('unsubscribe')
    @HttpCode(200)
    @ApiOperation({ summary: 'Stops marketing messages for the family the token belongs to' })
    @ApiResponse({ status: 200, description: 'Recorded, if the token named anybody' })
    async unsubscribe(@Body() dto: UnsubscribeDto) {
        await this.unsubscribeService.unsubscribe(dto.token);
        return { message: 'Nu îți vom mai trimite mesaje despre noutăți.' };
    }
}
