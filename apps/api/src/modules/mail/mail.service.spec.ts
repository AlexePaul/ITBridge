import { MailNotConfiguredError, MailSendError, MailService } from './mail.service';

/**
 * `MailService` has no repositories and one dependency: the provider, reached over `fetch`. So the
 * double is `fetch` itself, and what is worth asserting is the two things a caller cannot see for
 * itself — the exact request Resend receives, and whether a refusal is worth repeating.
 */
describe('MailService', () => {
    let service: MailService;
    let fetchMock: jest.Mock;

    const message = { to: 'parinte@example.com', subject: 'Ședința de marți e anulată', text: 'Salut,' };

    /** A Resend answer, close enough to the real shape for the parts the service reads. */
    function respond(status: number, body: unknown): Response {
        return {
            ok: status >= 200 && status < 300,
            status,
            json: () => Promise.resolve(body),
            text: () => Promise.resolve(typeof body === 'string' ? body : JSON.stringify(body)),
        } as unknown as Response;
    }

    beforeEach(() => {
        process.env.MAIL_RESEND_API_KEY = 're_test_key';
        process.env.MAIL_FROM = 'IT Bridge School <notificari@itbridgeschool.com>';

        fetchMock = jest.fn().mockResolvedValue(respond(200, { id: 'msg_1' }));
        global.fetch = fetchMock;

        service = new MailService();
    });

    afterEach(() => {
        delete process.env.MAIL_RESEND_API_KEY;
        delete process.env.MAIL_FROM;
    });

    it('posts the message to Resend and returns the provider id', async () => {
        const id = await service.send({ ...message, html: '<p>Salut,</p>' });

        expect(id).toBe('msg_1');
        const [url, init] = fetchMock.mock.calls[0];
        expect(url).toBe('https://api.resend.com/emails');
        expect(init.method).toBe('POST');
        expect(init.headers.authorization).toBe('Bearer re_test_key');

        const body = JSON.parse(init.body);
        expect(body).toMatchObject({
            from: 'IT Bridge School <notificari@itbridgeschool.com>',
            subject: message.subject,
            text: message.text,
            html: '<p>Salut,</p>',
        });
    });

    // E17: a message about a child has exactly one recipient. Nothing here takes a list, so nothing
    // downstream can accidentally address two families at once.
    it('sends to exactly one recipient', async () => {
        await service.send(message);

        const body = JSON.parse(fetchMock.mock.calls[0][1].body);
        expect(body.to).toEqual(['parinte@example.com']);
    });

    it('omits html entirely when there is none, rather than sending an empty one', async () => {
        await service.send({ ...message, html: null });

        const body = JSON.parse(fetchMock.mock.calls[0][1].body);
        expect(body).not.toHaveProperty('html');
    });

    it('accepts a send the provider acknowledges without an id', async () => {
        fetchMock.mockResolvedValue(respond(200, {}));
        await expect(service.send(message)).resolves.toBeNull();
    });

    describe('without configuration', () => {
        // Local development has no key and must still work. What must not happen is a silent
        // no-op: the caller is told, so the outbox row keeps the reason.
        it('refuses without an API key, and does not call the provider', async () => {
            delete process.env.MAIL_RESEND_API_KEY;

            await expect(service.send(message)).rejects.toThrow(MailNotConfiguredError);
            expect(fetchMock).not.toHaveBeenCalled();
        });

        it('refuses without a sender, which Resend would reject anyway', async () => {
            delete process.env.MAIL_FROM;

            await expect(service.send(message)).rejects.toThrow(MailNotConfiguredError);
            expect(fetchMock).not.toHaveBeenCalled();
        });

        it('names what is missing, both of them if both are', async () => {
            delete process.env.MAIL_RESEND_API_KEY;
            delete process.env.MAIL_FROM;

            await expect(service.send(message)).rejects.toThrow(/MAIL_RESEND_API_KEY and MAIL_FROM/);
            expect(service.isConfigured()).toBe(false);
        });
    });

    describe('when the provider refuses', () => {
        // The distinction E17/S3 asks for. Retrying a 422 sends the identical request and gets the
        // identical answer, so the row stops now and stays visible as a permanent failure.
        it.each([
            [400, true],
            [401, true],
            [403, true],
            [422, true],
            [408, false],
            [429, false],
            [500, false],
            [503, false],
        ])('treats %i as permanent=%s', async (status, permanent) => {
            fetchMock.mockResolvedValue(respond(status, { message: 'nope' }));

            await expect(service.send(message)).rejects.toMatchObject({ permanent, status });
        });

        it('keeps what the provider said, because a revoked key and an unverified domain are both a bare 403', async () => {
            fetchMock.mockResolvedValue(respond(403, { message: 'The itbridgeschool.com domain is not verified' }));

            await expect(service.send(message)).rejects.toThrow(/domain is not verified/);
        });

        // The error text is written onto the outbox row and into the log; a bearer token that can
        // send mail as the school has no business in either.
        it('never puts the API key in the error', async () => {
            fetchMock.mockResolvedValue(respond(401, { message: 'Invalid API key' }));

            await expect(service.send(message)).rejects.toThrow(expect.objectContaining({ message: expect.not.stringContaining('re_test_key') }));
        });

        it('survives an error body it cannot read', async () => {
            fetchMock.mockResolvedValue({
                ok: false,
                status: 500,
                text: () => Promise.reject(new Error('socket hang up')),
            });

            await expect(service.send(message)).rejects.toThrow(MailSendError);
        });
    });

    // We never got an answer, so we do not know whether it went out. A duplicate notice is the
    // cheaper mistake than a lost one, so this retries.
    it('treats an unreachable provider as temporary', async () => {
        fetchMock.mockRejectedValue(new Error('The operation was aborted due to timeout'));

        await expect(service.send(message)).rejects.toMatchObject({ permanent: false });
        await expect(service.send(message)).rejects.toThrow(/could not be reached/);
    });
});
