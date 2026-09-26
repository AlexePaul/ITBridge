/**
 * What is still ticked on a group's documents screen after the list has been read again — E14/S4.
 *
 * Only documents still waiting to be sent. The selection outlived the list it was made from: a
 * ticked document deleted before "Trimite" stayed in the set, so the button counted it, the server
 * answered 404 for an id it no longer had, and nothing at all was sent — with "Deselectează tot" the
 * only way out (review of 25 September 2026). A document sent meanwhile, from another tab, is no
 * longer something this button can send either.
 */
export function stillSelectable(
  selected: ReadonlySet<number>,
  projects: readonly { id: number; status: string }[]
): Set<number> {
  const waiting = new Set(
    projects.filter((project) => project.status !== "sent").map((project) => project.id)
  );
  return new Set([...selected].filter((id) => waiting.has(id)));
}
