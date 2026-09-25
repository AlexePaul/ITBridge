import { INestApplication } from '@nestjs/common';
import { DataSource } from 'typeorm';
import request from 'supertest';
import { App } from 'supertest/types';
import { createTestApp, ownProfileId, promoteToAdmin, registerUser, TestUser, truncateAll } from './helpers';
import { officeAddress } from 'src/modules/mail/office-address';

interface PurposeState {
    purpose: string;
    currentVersion: string;
    inForce: { id: number; grantedVia: string; textVersion: string; grantedAt: string } | null;
    history: { id: number; grantedAt: string; grantedVia: string; revokedAt: string | null; revokedVia: string | null }[];
}

interface ChildState {
    childId: number;
    firstName: string;
    purposes: PurposeState[];
}

/**
 * A family's consent to use a child's work — E07 S2.
 *
 * The acceptance, in the epic's words: a parent with two children can accept for one and refuse for
 * the other, and what the school may use shows exactly that. Around it, what makes a consent worth
 * recording at all — it can be proven (the version and the day), it can be withdrawn as easily as
 * it was given, and a withdrawal reaches the person who has to take the work down.
 */
describe('Publication consent (e2e)', () => {
    let app: INestApplication<App>;
    let dataSource: DataSource;

    let admin: TestUser;
    let parent: TestUser;
    let profileId: number;
    let elder: number;
    let younger: number;

    beforeAll(async () => {
        ({ app, dataSource } = await createTestApp());
    });

    afterAll(async () => {
        await app.close();
    });

    const addChild = async (user: TestUser, parentId: number, firstName: string): Promise<number> => {
        const res = await request(app.getHttpServer())
            .post('/children')
            .set('Authorization', user.auth)
            .send({ firstName, lastName: 'Popescu', birthDate: '2016-05-01', parentId })
            .expect(201);
        return res.body.id as number;
    };

    beforeEach(async () => {
        await truncateAll(dataSource);
        admin = await promoteToAdmin(app, dataSource, await registerUser(app, 'admin.acord'));
        parent = await registerUser(app, 'parinte.acord');
        profileId = await ownProfileId(app, parent);
        elder = await addChild(parent, profileId, 'Matei');
        younger = await addChild(parent, profileId, 'Ioana');
    });

    const grant = (childId: number, user: TestUser = parent, purpose = 'promotion') =>
        request(app.getHttpServer()).put(`/privacy/consents/${childId}/${purpose}`).set('Authorization', user.auth);

    const revoke = (childId: number, user: TestUser = parent, purpose = 'promotion') =>
        request(app.getHttpServer()).delete(`/privacy/consents/${childId}/${purpose}`).set('Authorization', user.auth);

    const inForce = async () =>
        (await request(app.getHttpServer()).get('/privacy/consents/in-force').set('Authorization', admin.auth).expect(200)).body as {
            child: { id: number; firstName: string; birthDate: string };
            family: { id: number };
            grantedVia: string;
            textVersion: string;
        }[];

    const messages = (where: string, params: unknown[]) =>
        dataSource.query<{ to: string; subject: string; status: string; bodyText: string }[]>(
            `SELECT "to", "subject", "status", "bodyText" FROM "outbox" WHERE ${where} ORDER BY id`,
            params,
        );

    describe('the acceptance: one child yes, the other no', () => {
        it('a parent agrees for the elder and not the younger, and the office list shows exactly that', async () => {
            const res = await grant(elder).expect(200);
            const answer = res.body as ChildState;

            expect(answer.childId).toBe(elder);
            expect(answer.purposes[0].inForce).toMatchObject({ grantedVia: 'portal', textVersion: '0.1' });

            const list = await inForce();
            expect(list.map((row) => row.child.id)).toEqual([elder]);
            expect(list[0]).toMatchObject({ family: { id: profileId }, grantedVia: 'portal', textVersion: '0.1' });
            // The day of birth, as a day: the office prints the age next to the work from it.
            expect(list[0].child.birthDate).toBe('2016-05-01');

            // And the family's own page tells the two apart: the younger was never asked about.
            const family = (await request(app.getHttpServer()).get('/privacy/consents').set('Authorization', parent.auth).expect(200)).body as {
                profileId: number;
                children: ChildState[];
            };
            expect(family.profileId).toBe(profileId);
            const byChild = new Map(family.children.map((child) => [child.childId, child.purposes[0]]));
            expect(byChild.get(elder)?.inForce).not.toBeNull();
            expect(byChild.get(younger)).toMatchObject({ purpose: 'promotion', currentVersion: '0.1', inForce: null, history: [] });
        });
    });

    describe('giving it', () => {
        it('confirms it to the family by email, with the version they read', async () => {
            await grant(elder).expect(200);

            const sent = await messages(`"to" = $1`, ['parinte.acord@example.com']);
            const confirmation = sent.find((row) => row.subject.startsWith('Acordul pentru lucrările făcute de Matei'));
            expect(confirmation).toBeDefined();
            expect(confirmation?.status).toBe('pending');
            expect(confirmation?.bodyText).toContain('din contul tău');
            expect(confirmation?.bodyText).toContain('versiunea 0.1');
            expect(confirmation?.bodyText).toContain('/acord-lucrari');
        });

        it('a second press changes nothing — not the row, not the day, not the email', async () => {
            const first = (await grant(elder).expect(200)).body as ChildState;
            const second = (await grant(elder).expect(200)).body as ChildState;

            expect(second.purposes[0].inForce).toEqual(first.purposes[0].inForce);
            expect(second.purposes[0].history).toHaveLength(1);
            const [{ n }] = await dataSource.query<{ n: number }[]>(`SELECT count(*)::int AS n FROM publication_consents`);
            expect(n).toBe(1);
            const confirmations = await messages(`"subject" LIKE 'Acordul pentru lucrările%'`, []);
            expect(confirmations).toHaveLength(1);
        });

        it('two presses at the same instant still leave one consent in force', async () => {
            const [a, b] = await Promise.all([grant(elder), grant(elder)]);

            expect(a.status).toBe(200);
            expect(b.status).toBe(200);
            const [{ n }] = await dataSource.query<{ n: number }[]>(`SELECT count(*)::int AS n FROM publication_consents WHERE "revokedAt" IS NULL`);
            expect(n).toBe(1);
        });

        it('leaves a trail of who did it, with the field names and never the values', async () => {
            const answer = (await grant(elder).expect(200)).body as ChildState;
            const consentId = answer.purposes[0].inForce?.id;

            const trail = await dataSource.query<{ actor_user_id: number; action: string; changes: Record<string, unknown> }[]>(
                `SELECT actor_user_id, action, changes FROM audit_log WHERE entity_type = 'PublicationConsent' AND entity_id = $1`,
                [consentId],
            );
            expect(trail).toHaveLength(1);
            expect(trail[0].actor_user_id).toBe(parent.userId);
            expect(Object.keys(trail[0].changes).sort()).toEqual(['grantedAt', 'grantedVia', 'purpose', 'textVersion']);
        });
    });

    describe('taking it back', () => {
        it('stamps the row rather than deleting it, and the child leaves the office list', async () => {
            await grant(elder).expect(200);
            const answer = (await revoke(elder).expect(200)).body as ChildState;

            expect(answer.purposes[0].inForce).toBeNull();
            expect(answer.purposes[0].history).toHaveLength(1);
            expect(answer.purposes[0].history[0]).toMatchObject({ grantedVia: 'portal', revokedVia: 'portal' });
            expect(answer.purposes[0].history[0].revokedAt).not.toBeNull();
            expect(await inForce()).toEqual([]);
        });

        it('tells the office, because what was already published has to come down by hand', async () => {
            await grant(elder).expect(200);
            await revoke(elder).expect(200);

            const notices = await messages(`"to" = $1 AND "subject" LIKE 'Acord retras%'`, [officeAddress()]);
            expect(notices).toHaveLength(1);
            expect(notices[0].subject).toBe('Acord retras: lucrările făcute de Matei Popescu');
            expect(notices[0].bodyText).toContain('din portal, de familie');
            expect(notices[0].bodyText).toContain(`/admin/profiles/${profileId}`);

            const toFamily = await messages(`"to" = $1 AND "subject" LIKE '%a fost retras'`, ['parinte.acord@example.com']);
            expect(toFamily).toHaveLength(1);
        });

        it('with nothing in force there is nothing to withdraw and nobody to tell', async () => {
            await revoke(younger).expect(200);
            await grant(elder).expect(200);
            await revoke(elder).expect(200);
            await revoke(elder).expect(200);

            const notices = await messages(`"subject" LIKE 'Acord retras%'`, []);
            expect(notices).toHaveLength(1);
        });

        it('giving it again is a new consent, with its own day, and the old one stays in the history', async () => {
            await grant(elder).expect(200);
            await revoke(elder).expect(200);
            const answer = (await grant(elder).expect(200)).body as ChildState;

            const [promotion] = answer.purposes;
            expect(promotion.history).toHaveLength(2);
            expect(promotion.inForce?.id).toBe(promotion.history[0].id);
            expect(promotion.history[1].revokedAt).not.toBeNull();
            const confirmations = await messages(`"subject" LIKE 'Acordul pentru lucrările făcute de Matei'`, []);
            expect(confirmations).toHaveLength(2);
        });
    });

    describe('whose children', () => {
        it("refuses a parent deciding for another family's child, both ways", async () => {
            const other = await registerUser(app, 'alta.familie.acord');

            await grant(elder, other).expect(403);
            await grant(elder).expect(200);
            await revoke(elder, other).expect(403);

            expect((await inForce()).map((row) => row.child.id)).toEqual([elder]);
        });

        it('a parent sees only their own family, and neither the list nor another family by id', async () => {
            const other = await registerUser(app, 'alta.familie.acord');
            const theirs = await addChild(other, await ownProfileId(app, other), 'Radu');
            await grant(theirs, other).expect(200);

            const mine = (await request(app.getHttpServer()).get('/privacy/consents').set('Authorization', parent.auth).expect(200)).body as {
                children: ChildState[];
            };
            expect(mine.children.map((child) => child.childId).sort()).toEqual([elder, younger].sort());

            await request(app.getHttpServer()).get('/privacy/consents/in-force').set('Authorization', parent.auth).expect(403);
            await request(app.getHttpServer()).get(`/privacy/consents/profile/${profileId}`).set('Authorization', parent.auth).expect(403);
        });

        it('an unknown purpose is refused, not stored', async () => {
            await grant(elder, parent, 'showcase').expect(400);
        });

        it('a missing child is a 404', async () => {
            await grant(999_999).expect(404);
        });
    });

    describe('the office, for a family that signed on paper', () => {
        it('records it for a family with no account, and says so on the row and to the family', async () => {
            const typedIn = await request(app.getHttpServer())
                .post('/profiles')
                .set('Authorization', admin.auth)
                .send({ firstName: 'Elena', lastName: 'Ionescu', email: 'elena.ionescu@example.com' })
                .expect(201);
            const theirProfile = typedIn.body.id as number;
            const child = await addChild(admin, theirProfile, 'Sofia');

            const answer = (await grant(child, admin).expect(200)).body as ChildState;
            expect(answer.purposes[0].inForce).toMatchObject({ grantedVia: 'office' });

            // No account is not "unconfirmed": the address the office was given is the one to use.
            const sent = await messages(`"to" = $1`, ['elena.ionescu@example.com']);
            expect(sent).toHaveLength(1);
            expect(sent[0].status).toBe('pending');
            expect(sent[0].bodyText).toContain('de birou, la cererea ta');

            const family = (await request(app.getHttpServer()).get(`/privacy/consents/profile/${theirProfile}`).set('Authorization', admin.auth).expect(200))
                .body as { children: ChildState[] };
            expect(family.children).toHaveLength(1);
            expect(family.children[0].purposes[0].inForce?.grantedVia).toBe('office');
        });

        it("withdraws a parent's own consent on their behalf, and the row says who wrote it", async () => {
            await grant(elder).expect(200);
            const answer = (await revoke(elder, admin).expect(200)).body as ChildState;

            expect(answer.purposes[0].history[0]).toMatchObject({ grantedVia: 'portal', revokedVia: 'office' });
            const notices = await messages(`"to" = $1 AND "subject" LIKE 'Acord retras%'`, [officeAddress()]);
            expect(notices[0].bodyText).toContain('(de birou)');
        });
    });

    describe('what the family can read back, and what goes with the child', () => {
        it('the export carries every consent, the withdrawn ones included', async () => {
            await grant(elder).expect(200);
            await revoke(elder).expect(200);
            await grant(elder).expect(200);

            const res = await request(app.getHttpServer()).get('/privacy/export').set('Authorization', parent.auth).expect(200);
            const children = res.body.copii as { nume: string; acorduriPentruLucrari: { datPrin: string; retrasLa: string | null }[] }[];
            const matei = children.find((child) => child.nume === 'Matei Popescu');
            expect(matei?.acorduriPentruLucrari).toHaveLength(2);
            expect(matei?.acorduriPentruLucrari.filter((row) => row.retrasLa === null)).toHaveLength(1);
            expect(children.find((child) => child.nume === 'Ioana Popescu')?.acorduriPentruLucrari).toEqual([]);
        });

        it('deleting the child takes its consents with it', async () => {
            await grant(younger).expect(200);

            await request(app.getHttpServer()).delete(`/children/${younger}`).set('Authorization', parent.auth).expect(200);

            const [{ n }] = await dataSource.query<{ n: number }[]>(`SELECT count(*)::int AS n FROM publication_consents`);
            expect(n).toBe(0);
        });
    });
});
