import { Body, Controller, Get, Post, Query } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { ApiOperation, ApiResponse } from '@nestjs/swagger';
import { BookTrialDto } from './dto/bookTrial.dto';
import { TrialSlotsDto } from './dto/trialSlots.dto';
import { TrialBookingService } from './trial-booking.service';

/**
 * The only two endpoints in this codebase a parent uses without an account — E20/S2.
 *
 * They are public because a trial booking is a lead, not an obligation: nothing here creates a
 * `User`, nothing here promises a place in a group, and the epic's decision that enrolment is **not**
 * self-service is untouched by them. A parent who books gets a class and a phone call afterwards.
 *
 * A controller of its own rather than more routes on `/leads`, for the reason `AgentController` is
 * separate from `ProjectController`: the audience is different. Everything on `/leads` is a screen
 * in the office, behind `AuthGuard` and `ADMIN`; everything here is a stranger on a phone at 20:00.
 * Keeping them apart is what makes the authorization matrix readable — the public surface is one
 * file, two handlers, and both are on the allowlist by name.
 *
 * **Throttled hard**, because this is a public write. `POST` writes a family, a child and a seat, so
 * it is limited far below the global bucket; the read is looser, since a parent legitimately tries
 * two or three ages and both addresses. Unlike the contact form's counter — per serverless instance,
 * in memory, as its own comment admits — this one is a real limiter in a real process.
 */
@Controller('trial')
export class TrialController {
    constructor(private readonly booking: TrialBookingService) {}

    @Get('slots')
    @Throttle({ default: { ttl: 60_000, limit: 30 } })
    @ApiOperation({
        summary: 'The classes a child of this age could come to',
        description:
            "Active groups whose age band fits and which still have a free seat, each with the dates it runs on in the next three weeks. A full group does not appear at all: a trial takes one of the room's ten seats (E11/D7), so offering one would promise a chair that does not exist.",
    })
    @ApiResponse({ status: 200, description: 'Groups with free seats and their upcoming classes. An empty list means "nothing for this child right now".' })
    async slots(@Query() query: TrialSlotsDto) {
        return this.booking.slots(query);
    }

    @Post('bookings')
    @Throttle({ default: { ttl: 60_000, limit: 5 } })
    @ApiOperation({
        summary: 'Book a trial class, or be remembered when there is no seat',
        description:
            'Never answers with an error the parent has to solve. Either the class is booked, or the request is kept as a lead marked „no seats" — including when the last seat goes between the page loading and the button being pressed, which is checked again here rather than trusted from the list.',
    })
    @ApiResponse({ status: 201, description: 'Booked, or kept — the `status` field says which' })
    @ApiResponse({ status: 400, description: 'No way to reach the family: one of email or phone is required' })
    async book(@Body() dto: BookTrialDto) {
        return this.booking.book(dto);
    }
}
