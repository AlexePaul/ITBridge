import type { Location } from './location';

/** A teaching room. Room names repeat across locations, so a room is only identified with one. */
export interface Room {
    id: number;
    name: string;
    capacity: number;
    computers: number;
    hasProjector: boolean;
    hasWhiteboard: boolean;
    isActive: boolean;
    location: Location;
}
