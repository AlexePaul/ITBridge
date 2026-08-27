import { ValueTransformer } from 'typeorm';

/**
 * `decimal` columns as numbers in the application, strings in Postgres.
 *
 * node-postgres returns `numeric`/`decimal` as a string, because a JS number cannot represent every
 * value the column can hold. The entity declaring `minAge: number` does not change that — it just
 * makes the declaration a lie, and `contract.ts` compares declarations, so nothing catches it.
 * `Invoice.amount` carried this inline from the start; the other three decimal columns did not.
 */
export const decimalAsNumber: ValueTransformer = {
    to: (value: number | null) => value,
    from: (value: string | null) => (value === null ? null : Number(value)),
};
