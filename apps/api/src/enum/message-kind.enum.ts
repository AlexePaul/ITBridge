/**
 * What a message is for — E17/S4, and the whole of the guarantee that story asks for.
 *
 * The distinction is legal before it is technical. A transactional message is the school performing
 * the contract it has with a family: the invoice, the receipt, the class that was called off, the
 * child's own work. None of those can be switched off, and none of them rests on consent — see
 * E07/S8 and E14/S4. Marketing is the only optional kind, and the only one a preference gates.
 *
 * The default everywhere is `TRANSACTIONAL`, so a sender that says nothing keeps sending. That is
 * the safe direction to fail: the alternative default would quietly stop invoices the day somebody
 * forgot an argument.
 */
export enum MessageKind {
    /** Performing the contract. Never gated, never suppressed, never optional. */
    TRANSACTIONAL = 'transactional',
    /** Everything a family may decline without losing anything they are owed. */
    MARKETING = 'marketing',
}
