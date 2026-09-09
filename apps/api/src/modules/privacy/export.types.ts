/**
 * The shape of a family's export — E07 S4.
 *
 * **Romanian keys, on purpose.** The rest of the codebase is English and stays that way; this
 * document is not code, it is the answer a family receives to "ce date țineți despre copilul meu".
 * GDPR art. 15 wants it intelligible to them, so the field names are the ones they would use — the
 * same rule that puts the interface strings, the e-mails and the PDFs in Romanian.
 */
export interface FamilyExport {
    generatedAt: string;
    parinte: {
        nume: string;
        email: string | null;
        telefon: string | null;
        adresa: string | null;
        contactDeUrgenta: { nume: string; relatie: string | null; telefon: string | null } | null;
        acceptaComunicariComerciale: boolean;
    };
    cont: {
        utilizator: string;
        rol: string;
        creatLa: string | null;
        emailConfirmatLa: string | null;
        stareAprobare: string;
        aprobatLa: string | null;
    } | null;
    copii: ExportedChild[];
    facturi: {
        luna: string;
        suma: number;
        emisaLa: string | null;
        stare: string;
        plati: { suma: number; metoda: string; stare: string; data: string | null; referinta: string | null }[];
    }[];
    reduceri: { nume: string; tip: string; valoare: number; luna: string }[];
    solicitari: {
        stare: string;
        sursa: string;
        copil: string;
        dataNasteriiCopilului: string | null;
        experienta: string | null;
        probaTinutaLa: string | null;
        creatLa: string | null;
    }[];
    /** Subject and delivery only. The body is the school's text, and the family already has it. */
    mesajePrimite: { subiect: string; trimisLa: string | null; stare: string }[];
    /** No token, ever: what a family may want is that a session existed and from what device. */
    autentificari: { incepiuta: string | null; expiraLa: string | null; revocataLa: string | null; dispozitiv: string | null }[];
    confirmariDeEmail: { adresa: string; trimisLa: string | null; deschisLa: string | null }[];
    documenteAcceptate: { document: string; versiune: string; acceptatLa: string | null }[];
}

export interface ExportedChild {
    nume: string;
    dataNasterii: string | null;
    inregistratLa: string | null;
    grupa: string | null;
    locatie: string | null;
    inscrieri: {
        grupa: string | null;
        stare: string;
        de: string | null;
        pana: string | null;
        motivIesire: string | null;
        contractSemnatLa: string | null;
    }[];
    listaDeAsteptare: {
        grupa: string | null;
        stare: string;
        cerutLa: string | null;
        oferitLa: string | null;
        raspunsPanaLa: string | null;
        nota: string | null;
    }[];
    prezente: { data: string | null; grupa: string | null; prezent: boolean; tip: string }[];
    absenteAnuntate: { data: string | null; motiv: string | null; inTermen: boolean; anuntatLa: string | null }[];
    corecturiDeSedinte: { luna: string; sedinte: number; motiv: string | null }[];
    proiecte: {
        titlu: string;
        descriere: string | null;
        realizatLa: string | null;
        stare: string;
        trimisLa: string | null;
        trimisLaAdresa: string | null;
        fisiere: string[];
        legaturi: { eticheta: string; adresa: string }[];
    }[];
}
