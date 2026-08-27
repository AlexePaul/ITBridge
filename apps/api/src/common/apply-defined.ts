/**
 * Copies only the defined properties of a partial update onto an entity.
 *
 * `Object.assign(entity, dto)` is the obvious thing and it is wrong here. `plainToInstance` defines
 * every field a DTO class declares, so an instance built from `{ weekday: 3 }` still carries
 * `startTime`, `endTime` and the rest as own properties holding `undefined`. Assigning those over a
 * loaded entity blanks them: TypeORM skips undefined on save, so the row survives — but the entity
 * handed back to the caller has null everywhere the request stayed silent.
 */
export function applyDefined<T extends object>(entity: T, changes: object): T {
    for (const [key, value] of Object.entries(changes)) {
        if (value !== undefined) {
            (entity as Record<string, unknown>)[key] = value;
        }
    }
    return entity;
}
