// Contractul trăiește în packages/types. Fișierul rămâne ca punte, ca importurile `~/types/...`
// existente să nu se schimbe — dar nu mai redeclară nimic.
export type { Attendance, AttendanceType } from "@itbridge/types";
