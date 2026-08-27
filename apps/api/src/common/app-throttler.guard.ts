import { ExecutionContext, Injectable } from '@nestjs/common';
import { ThrottlerGuard } from '@nestjs/throttler';

/**
 * The throttler, with an off switch.
 *
 * `RATE_LIMIT_ENABLED=false` turns it off entirely. That is a real deployment option — behind a CDN
 * or WAF that already rate-limits, a second limiter counting the proxy's IP does more harm than
 * good — and it is what the test suites use, since a couple of dozen tests registering users in
 * `beforeEach` would otherwise measure the suite rather than the behaviour under test.
 *
 * It defaults to on, so leaving the variable unset is the safe case.
 */
@Injectable()
export class AppThrottlerGuard extends ThrottlerGuard {
    protected shouldSkip(context: ExecutionContext): Promise<boolean> {
        if (process.env.RATE_LIMIT_ENABLED === 'false') {
            return Promise.resolve(true);
        }
        return super.shouldSkip(context);
    }
}
