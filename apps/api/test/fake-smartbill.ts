import { createServer, IncomingMessage, Server, ServerResponse } from 'node:http';
import type { AddressInfo } from 'node:net';

/**
 * SmartBill V1, as far as the platform uses it — for the fiscal queue's suite (E16/S2).
 *
 * A real HTTP server, not a stubbed `fetch`: the cases worth testing are the ones where the network
 * misbehaves — an answer lost after the invoice was written, a lock-out mid-month — and a stub that
 * hands back a prepared value cannot lose an answer. The shapes follow the OpenAPI spec SmartBill
 * publishes: `errorText` is the truth, a draft gets no number, an unknown PDF is a 502 with an nginx
 * page, and `Accept: application/pdf` is a 406.
 */

export interface FakeDocument {
    series: string;
    /** `null` for a draft: "fara numar alocat pana la finalizarea manuala". */
    number: string | null;
    isDraft: boolean;
    documentId: number;
    payload: Record<string, unknown>;
}

export interface FakeRequest {
    method: string;
    path: string;
    query: URLSearchParams;
    headers: IncomingMessage['headers'];
    body: unknown;
}

/**
 * What the next `POST /invoice/v2` does instead of answering normally.
 *
 *  - `refuse` — 400 with an `errorText`, nothing written.
 *  - `lockout` — the live rate-limit answer: a 403 naming the limit.
 *  - `drop-after-issue` — the invoice is written, then the connection is cut: the case where a
 *    fiscal document exists that the platform never heard about.
 *  - `drop-before-issue` — the connection is cut and nothing is written.
 *  - `unauthorised` — the 401 of a wrong token.
 *  - `none` — answers normally; a placeholder, so a failure can be aimed at the second request.
 */
export type FakeFailure = 'none' | 'refuse' | 'lockout' | 'drop-after-issue' | 'drop-before-issue' | 'unauthorised';

export const FAKE_CREDENTIALS = { username: 'office@itbridgeschool.test', token: 'fake-token-123', cif: 'RO12345678' };

export class FakeSmartBill {
    readonly documents: FakeDocument[] = [];
    readonly requests: FakeRequest[] = [];
    readonly series = new Map<string, { nextNumber: number; type: 'f' | 'p' | 'c' }>([
        ['ITB', { nextNumber: 41, type: 'f' }],
        ['FCT', { nextNumber: 900, type: 'f' }],
        ['CH', { nextNumber: 7, type: 'c' }],
    ]);
    taxes = [
        { name: 'Normala', percentage: 21 },
        { name: 'SFDD', percentage: 0 },
    ];

    private failures: FakeFailure[] = [];
    private nextDocumentId = 20_000;
    private server: Server | null = null;

    /** Queues failures for the next invoice requests, in order. */
    failNext(...failures: FakeFailure[]): void {
        this.failures.push(...failures);
    }

    /** Somebody issuing by hand on the platform's series — what the dedicated-series rule forbids. */
    issueByHand(series: string): void {
        const entry = this.series.get(series);
        if (entry) entry.nextNumber += 1;
    }

    get issued(): FakeDocument[] {
        return this.documents.filter((document) => !document.isDraft);
    }

    async start(): Promise<string> {
        this.server = createServer((req, res) => void this.handle(req, res));
        await new Promise<void>((resolve) => this.server?.listen(0, '127.0.0.1', resolve));
        const { port } = this.server.address() as AddressInfo;
        return `http://127.0.0.1:${port}/SBORO/api`;
    }

    async stop(): Promise<void> {
        await new Promise<void>((resolve) => (this.server ? this.server.close(() => resolve()) : resolve()));
    }

    reset(): void {
        this.documents.length = 0;
        this.requests.length = 0;
        this.failures = [];
        this.series.set('ITB', { nextNumber: 41, type: 'f' });
        this.series.set('FCT', { nextNumber: 900, type: 'f' });
    }

    private async handle(req: IncomingMessage, res: ServerResponse): Promise<void> {
        const url = new URL(req.url ?? '/', 'http://fake');
        const raw = await readBody(req);
        const body: unknown = raw ? JSON.parse(raw) : undefined;
        const path = url.pathname.replace(/^\/SBORO\/api/, '');
        this.requests.push({ method: req.method ?? '', path, query: url.searchParams, headers: req.headers, body });

        const expected = `Basic ${Buffer.from(`${FAKE_CREDENTIALS.username}:${FAKE_CREDENTIALS.token}`).toString('base64')}`;
        if (req.headers.authorization !== expected) {
            return json(res, 401, { successfully: false, errorText: 'Autentificare esuata. Va rugam verificati datele si incercati din nou.', cooldown: 0 });
        }

        if (req.method === 'GET' && path === '/tax') {
            return json(res, 200, { errorText: '', message: '', taxes: this.taxes });
        }
        if (req.method === 'GET' && path === '/series') {
            const type = url.searchParams.get('type');
            const list = [...this.series.entries()]
                .filter(([, entry]) => !type || entry.type === type)
                .map(([name, entry]) => ({ name, nextNumber: entry.nextNumber, type: entry.type }));
            return json(res, 200, { errorText: '', message: '', list });
        }
        if (req.method === 'POST' && path === '/invoice/v2') {
            return this.issue(req, res, body as Record<string, unknown>);
        }
        if (req.method === 'GET' && path === '/invoice/pdf') {
            if (req.headers.accept === 'application/pdf') {
                return json(res, 406, { status: 406, type: 'invalid_request_error', errors: [{ code: 'invalid_accept_header' }] });
            }
            const found = this.documents.find(
                (document) => !document.isDraft && document.series === url.searchParams.get('seriesname') && document.number === url.searchParams.get('number'),
            );
            if (!found) {
                res.writeHead(502, { 'content-type': 'text/html' });
                res.end('<html><head><title>502 Bad Gateway</title></head><body><center><h1>502 Bad Gateway</h1></center></body></html>');
                return;
            }
            res.writeHead(200, { 'content-type': 'application/octet-stream' });
            res.end(Buffer.from(`%PDF-1.4 fiscal ${found.series} ${found.number}`));
            return;
        }
        return json(res, 404, { errorText: 'Not found' });
    }

    private issue(req: IncomingMessage, res: ServerResponse, payload: Record<string, unknown>): void {
        const failure = this.failures.shift();
        if (failure === 'unauthorised') {
            return json(res, 401, { successfully: false, errorText: 'Autentificare esuata. Va rugam verificati datele si incercati din nou.' });
        }
        if (failure === 'lockout') {
            return json(res, 403, {
                errorText: 'Ai depasit limita maxima de requesturi admisa. Vei putea executa alte requesturi dupa 10 min de la momentul blocarii',
            });
        }
        if (failure === 'refuse') {
            return json(res, 400, { errorText: 'Cota tva a produsului <b>Servicii</b> nu a fost gasita pe server!<br/>Verifica cotele.', documentId: -1 });
        }
        if (failure === 'drop-before-issue') {
            req.socket.destroy();
            return;
        }

        const series = this.series.get(String(payload.seriesName));
        if (!series || series.type !== 'f') {
            return json(res, 400, { errorText: 'Seria nu a fost gasita! Folositi o serie creata in contul de cloud.', documentId: -1 });
        }

        const isDraft = payload.isDraft === true;
        const number = isDraft ? null : String(series.nextNumber).padStart(4, '0');
        if (!isDraft) series.nextNumber += 1;
        const documentId = this.nextDocumentId++;
        this.documents.push({ series: String(payload.seriesName), number, isDraft, documentId, payload });

        if (failure === 'drop-after-issue') {
            req.socket.destroy();
            return;
        }

        return json(res, 200, {
            errorText: '',
            message: '',
            number: number ?? '',
            series: isDraft ? '' : String(payload.seriesName),
            url: '',
            documentUrl: `https://cloud.smartbill.ro/documente/editare/factura/${documentId}/`,
            documentId,
            documentViewUrl: isDraft ? '' : `https://cloud.smartbill.ro/documente/extern/pf/factura/hash${documentId}?srvid=2`,
        });
    }
}

function json(res: ServerResponse, status: number, body: unknown): void {
    res.writeHead(status, { 'content-type': 'application/json' });
    res.end(JSON.stringify(body));
}

function readBody(req: IncomingMessage): Promise<string> {
    return new Promise((resolve, reject) => {
        let data = '';
        req.setEncoding('utf8');
        req.on('data', (chunk: string) => (data += chunk));
        req.on('end', () => resolve(data));
        req.on('error', reject);
    });
}
