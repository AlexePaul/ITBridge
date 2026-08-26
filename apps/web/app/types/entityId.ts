/**
 * API ids are numeric, but arrive as strings when they come from `route.params`. The comparisons in
 * the stores use loose `==` precisely to cover both shapes, so the signatures must say so
 * explicitly - otherwise TypeScript reports them as having no overlap.
 */
export type EntityId = string | number;
