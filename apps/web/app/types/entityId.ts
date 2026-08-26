/**
 * Id-urile din API sunt numerice, dar ajung ca string când vin din `route.params`. Comparațiile
 * din store-uri folosesc `==` slab tocmai ca să acopere ambele forme, deci semnăturile trebuie
 * să spună asta explicit — altfel TypeScript le raportează ca fără suprapunere.
 */
export type EntityId = string | number;
