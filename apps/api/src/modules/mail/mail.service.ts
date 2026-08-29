import { Injectable, Logger, OnModuleInit } from '@nestjs/common';

/**
 * The only place `apps/api` talks to the email provider. E17/S1 and S3.
 *
 * **Nothing in the application calls this directly.** Everything goes through `OutboxService`,
 * which writes the message down first and lets the scheduler do the sending — that is the whole
 * point of E17/S3: no business operation waits on a provider, and no message is lost because one
 * was down. A service that calls `send` from inside a request handler has reintroduced exactly the
 * failure the outbox exists to prevent.
 *
 * Resend's REST API is one authenticated POST, so it is called directly rather than through the
 * SDK — the same request `resend` would make, and the same shape as the public contact form's
 * route in `apps/web/server/api/contact.post.ts`, which stays where it is: on Vercel that route is
 * a serverless function with no view of Postgres, and every message this service sends is composed
 * from data in Postgres.
 *
 * **The key is not the contact form's key.** E17 decided on two keys and two sending addresses.
 * The public route is open to anyone on the internet and its rate limiter is per-instance, so a
 * burst spread across Vercel instances can burn through a quota; a cancellation notice to a class
 * must not share that quota, and revoking one compromised key must not silence the other channel.
 */

const RESEND_ENDPOINT = 'https://api.resend.com/emails';

/** Resend answers well under a second; past this we are waiting on nothing and should retry later. */
const SEND_TIMEOUT_MS = 10_000;

/** Kept off the row and out of the log: a provider error page can be arbitrarily long. */
const MAX_DETAIL_LENGTH = 500;

export interface MailMessage {
    /** Exactly one recipient. E17: a message about a child goes to that child's parent, nobody else. */
    to: string;
    subject: string;
    text: string;
    html?: string | null;
    replyTo?: string | null;
}

/**
 * No API key, or no sending address. Separate from a rejected send because the cause is a
 * deployment that has not been finished, not a message that cannot be delivered.
 *
 * Treated as a *temporary* failure by the dispatcher, deliberately: setting the variable and
 * restarting rescues everything still queued, whereas giving up immediately would permanently fail
 * every message written between the deploy and the fix.
 */
export class MailNotConfiguredError extends Error {
    constructor(missing: string) {
        super(`Mail is not configured: ${missing} is not set. Nothing was sent.`);
        this.name = 'MailNotConfiguredError';
    }
}

/**
 * The provider was asked and did not accept the message.
 *
 * `permanent` is the distinction E17/S3 asks for — retry on a temporary failure, stop on a
 * permanent one. Asking again with the same body is only worth doing when the reason to expect a
 * different answer is on their side.
 */
export class MailSendError extends Error {
    constructor(
        message: string,
        readonly permanent: boolean,
        readonly status?: number,
    ) {
        super(message);
        this.name = 'MailSendError';
    }
}

interface ResendResponse {
    id?: string;
}

/**
 * Whether asking again with the same message could plausibly succeed.
 *
 * 4xx means Resend understood us and refused: an invalid address, a sending domain that is not
 * verified, a revoked key. Every retry sends the identical request and gets the identical refusal,
 * so the row stops now and stays visible as a permanent failure (E17/S5). The two exceptions are
 * the ones that mean "not now" rather than "not this": 408 and 429. 5xx is theirs to fix, so we
 * wait.
 */
function isPermanentStatus(status: number): boolean {
    if (status === 408 || status === 429) {
        return false;
    }
    return status >= 400 && status < 500;
}

@Injectable()
export class MailService implements OnModuleInit {
    private readonly logger = new Logger('Mail');

    /**
     * Says once, at boot, whether this backend can send at all.
     *
     * Without it the first sign of a missing key is a failed row in a table nobody is watching,
     * hours after the deploy. The application still starts either way: local development has no
     * key and must not need one.
     */
    onModuleInit(): void {
        const missing = this.missingConfiguration();
        if (missing.length === 0) {
            this.logger.log(`Sending through Resend as ${process.env.MAIL_FROM}`);
        } else {
            this.logger.warn(`Not configured (${missing.join(', ')}). Queued mail will fail and stay in the outbox until this is set.`);
        }
    }

    /** True when a send has some chance of leaving the building. Read before composing anything expensive. */
    isConfigured(): boolean {
        return this.missingConfiguration().length === 0;
    }

    private missingConfiguration(): string[] {
        const missing: string[] = [];
        if (!process.env.MAIL_RESEND_API_KEY) {
            missing.push('MAIL_RESEND_API_KEY');
        }
        if (!process.env.MAIL_FROM) {
            missing.push('MAIL_FROM');
        }
        return missing;
    }

    /**
     * Hands one message to Resend. Returns the provider's id for the delivery record, or null when
     * the provider accepted without giving one.
     *
     * Throws `MailNotConfiguredError` or `MailSendError`; both carry enough to write onto the
     * outbox row. Nothing here retries — that belongs to the scheduler, which owns the backoff and
     * the attempt count.
     */
    async send(message: MailMessage): Promise<string | null> {
        // Read at call time rather than cached at construction, so a test can set the variables per
        // case and so nothing has to be reasoned about in terms of module load order.
        const apiKey = process.env.MAIL_RESEND_API_KEY;
        const from = process.env.MAIL_FROM;

        const missing = this.missingConfiguration();
        if (!apiKey || !from) {
            throw new MailNotConfiguredError(missing.join(' and '));
        }

        let response: Response;
        try {
            response = await fetch(RESEND_ENDPOINT, {
                method: 'POST',
                headers: {
                    authorization: `Bearer ${apiKey}`,
                    'content-type': 'application/json',
                },
                body: JSON.stringify({
                    // The sender is always the school, on a domain verified in Resend. A parent's
                    // address here would be an unauthenticated spoof and fail SPF/DKIM.
                    from,
                    to: [message.to],
                    subject: message.subject,
                    text: message.text,
                    ...(message.html ? { html: message.html } : {}),
                    ...(message.replyTo ? { reply_to: message.replyTo } : {}),
                }),
                signal: AbortSignal.timeout(SEND_TIMEOUT_MS),
            });
        } catch (error: unknown) {
            // A timeout, a DNS failure, a dropped connection: we never got an answer, so we do not
            // know whether the message went out. Retrying may duplicate it; not retrying may lose
            // it. A duplicate notice is the cheaper of the two mistakes, so this is temporary.
            const reason = error instanceof Error ? error.message : String(error);
            throw new MailSendError(`Resend could not be reached: ${reason}`, false);
        }

        if (!response.ok) {
            const detail = await this.readErrorBody(response);
            throw new MailSendError(`Resend answered ${response.status}: ${detail}`, isPermanentStatus(response.status), response.status);
        }

        const body = (await response.json().catch(() => null)) as ResendResponse | null;
        return body?.id ?? null;
    }

    /**
     * What Resend said, in one line. An unverified sending domain and a revoked key are both a
     * bare 403 without this, and they are fixed in completely different places.
     */
    private async readErrorBody(response: Response): Promise<string> {
        try {
            const text = await response.text();
            return text.replace(/\s+/g, ' ').trim().slice(0, MAX_DETAIL_LENGTH) || '(empty response)';
        } catch {
            return '(unreadable response)';
        }
    }
}
