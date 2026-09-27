/**
 * What the office's two lead forms — „Cerere nouă" and the lead's file — say when the server refuses
 * a field, in the words of the labels the office reads. One list for both DTOs, so a phone number
 * refused on the new request and on the file is refused in the same sentence.
 *
 * The screens print the validator's details as they come (`apiErrorMessage`), so the class-validator
 * default is the sentence the office reads when there is none here: „Cerere nouă" answered a
 * mistyped number with "parentPhone must be a valid phone number" (QA of 27 September 2026). The
 * public booking form has its own, addressed to the parent (`BookTrialDto`).
 */
export const LEAD_FORM_MESSAGES = {
    parentNameMissing: 'Scrie numele părintelui',
    parentNameLength: 'Numele părintelui trebuie să aibă între 2 și 160 de caractere',
    email: 'Adresa de email nu pare validă',
    emailLength: 'Adresa de email trebuie să aibă între 3 și 255 de caractere',
    phone: 'Numărul de telefon nu pare valid',
    phoneLength: 'Numărul de telefon trebuie să aibă între 5 și 30 de caractere',
    childFirstNameMissing: 'Scrie prenumele copilului',
    childFirstNameLength: 'Prenumele copilului trebuie să aibă între 2 și 100 de caractere',
    childLastNameMissing: 'Scrie numele copilului',
    childLastNameLength: 'Numele copilului trebuie să aibă între 2 și 100 de caractere',
    birthDate: 'Data nașterii nu pare validă',
    experience: 'Scrie ce a mai făcut copilul',
    experienceLength: 'Ce a mai făcut copilul e prea lung — cel mult 2000 de caractere',
    source: 'Alege cum a venit cererea',
    channel: 'Alege de unde a auzit familia de școală',
    location: 'Alege locația din listă',
    notes: 'Scrie notele ca text',
    notesLength: 'Notele sunt prea lungi — cel mult 4000 de caractere',
    nextActionAt: 'Ziua pasului următor nu pare validă',
} as const;
