/**
 * Whether a child answers to what somebody typed into a search box: the whole name, either way
 * round, or the id.
 *
 * The group register's "add a child from another group" box matched each field on its own, so
 * "Maria Popescu" — what the office actually types — was neither a first name nor a last name and
 * found nothing, while "Maria" alone found every Maria in the school (end-to-end testing, 25
 * September 2026). Spaces are collapsed, so a double space from a hurried thumb still matches.
 */
export function childMatches(
  child: { id: number; firstName: string; lastName: string },
  typed: string
): boolean {
  const query = typed.trim().toLowerCase().replace(/\s+/g, " ");
  if (!query) return false;
  return (
    `${child.firstName} ${child.lastName}`.toLowerCase().includes(query) ||
    `${child.lastName} ${child.firstName}`.toLowerCase().includes(query) ||
    String(child.id).includes(query)
  );
}
