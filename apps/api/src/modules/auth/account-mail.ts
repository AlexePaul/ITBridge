/**
 * The three messages the account gates produce (E11/S2).
 *
 * Plain functions, exported separately from the services that queue them, so the wording can be
 * asserted without a queue or a database behind it — the same split as
 * `composeUnmarkedReminder` in E12.
 *
 * Romanian, because parents read these. That is the exception CLAUDE.md carves out of the
 * everything-in-English rule, and it is the whole of it: identifiers and comments here stay
 * English.
 */

/** What the school signs off as. Used in every body below, so it is written once. */
const SIGNATURE = ['Cu drag,', 'Echipa IT Bridge School'].join('\n');

export interface ComposedMail {
    subject: string;
    bodyText: string;
}

/**
 * The confirmation link, sent to the address the parent typed.
 *
 * Says plainly that a second step follows. A parent who confirms their address and then hears
 * nothing has been told, by the silence, that something is broken — when in fact somebody at the
 * school simply has not looked at the approval screen yet. Naming the second gate here costs one
 * sentence and prevents that phone call.
 */
export function composeEmailConfirmation(firstName: string, confirmUrl: string): ComposedMail {
    const bodyText = [
        `Bună, ${firstName}!`,
        '',
        'Ai creat un cont pe platforma IT Bridge School. Ca să confirmi că adresa aceasta este a ta,',
        'deschide linkul de mai jos:',
        '',
        confirmUrl,
        '',
        'Linkul e valabil 48 de ore. După ce îl deschizi, contul mai are nevoie de o aprobare din',
        'partea noastră — te anunțăm printr-un email când e gata, de obicei în aceeași zi lucrătoare.',
        '',
        'Dacă nu tu ai cerut contul, ignoră mesajul: fără confirmare, contul nu poate fi folosit.',
        '',
        SIGNATURE,
    ].join('\n');

    return { subject: 'Confirmă adresa de email — IT Bridge School', bodyText };
}

/** Sent the moment an admin approves, so the wait ends with a message rather than with a guess. */
export function composeAccountApproved(firstName: string, portalUrl: string): ComposedMail {
    const bodyText = [
        `Bună, ${firstName}!`,
        '',
        'Contul tău a fost aprobat. Te poți autentifica aici:',
        '',
        portalUrl,
        '',
        'Următorul pas îl facem noi: îți repartizăm copilul într-o grupă potrivită ca vârstă și',
        'nivel. Dacă nu ne-am auzit încă despre asta, scrie-ne sau sună-ne și stabilim împreună.',
        '',
        SIGNATURE,
    ].join('\n');

    return { subject: 'Contul tău IT Bridge School e activ', bodyText };
}

/**
 * Sent when an admin refuses an account.
 *
 * **The rejection reason is not in the message.** It is a note one admin leaves another — "duplicat",
 * "cont de test" — written in the register, not in a letter. Sending it would either leak an internal
 * shorthand or force every admin to word each note as if a parent would read it, and the second is a
 * tax on the register that would end with nobody filling it in.
 */
export function composeAccountRejected(firstName: string, officeEmail: string): ComposedMail {
    const bodyText = [
        `Bună, ${firstName}!`,
        '',
        'Îți mulțumim pentru interesul față de IT Bridge School. Deocamdată nu am putut activa contul',
        'creat cu această adresă.',
        '',
        `Dacă ți se pare o greșeală — și se poate întâmpla — scrie-ne la ${officeEmail} și ne uităm încă o dată.`,
        '',
        SIGNATURE,
    ].join('\n');

    return { subject: 'Despre contul tău IT Bridge School', bodyText };
}

/**
 * The internal nudge: a family registered and is waiting.
 *
 * E11 lists "two gates before the first class" as a risk, and names the failure precisely — an
 * admin who does not open the approval screen on a Friday evening turns an enrolment into silence.
 * This message is the visible signal that risk asks for. It goes out on registration rather than on
 * email confirmation, because a family that never confirms is also something the school wants to
 * see.
 */
export function composeApprovalNeeded(parentName: string, email: string, phone: string, approvalsUrl: string): ComposedMail {
    const bodyText = [
        `${parentName} și-a creat un cont și așteaptă aprobare.`,
        '',
        `Email: ${email}`,
        `Telefon: ${phone}`,
        '',
        'Ecranul de aprobări:',
        approvalsUrl,
        '',
        'Contul nu poate fi folosit până când nu e și confirmat prin email, și aprobat de un admin.',
        'Ecranul arată amândouă stările.',
        '',
        'Mesaj automat.',
    ].join('\n');

    return { subject: `Cont nou de părinte: ${parentName}`, bodyText };
}
