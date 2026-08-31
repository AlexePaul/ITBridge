/**
 * How money actually reaches the school — E16/S1.
 *
 * A closed list, replacing the free-text column that held 'cash', 'card', 'credit_card' and 'other'
 * depending on which screen wrote it. Two values because the school collects exactly two ways:
 * cash at the desk, or a transfer into the bank account. Card-in-portal was cut from the MVP by
 * decision (E16 S4), so a value for it would be a state nothing can reach.
 */
export enum PaymentMethod {
    CASH = 'cash',
    BANK_TRANSFER = 'bank_transfer',
}
