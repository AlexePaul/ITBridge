/**
 * How a document arrived. E14/S2: the agent is the main road, not the only one.
 *
 * A Tinkercad model or a Canva design is not a file anyone saves into a folder, so an admin can add
 * a link — or a file — straight from the group screen. Recording which road it came by is what makes
 * "the agent has uploaded nothing today" answerable without counting rows a human typed in.
 */
export enum ProjectSource {
    AGENT = 'agent',
    ADMIN = 'admin',
}
