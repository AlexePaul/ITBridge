import type { Child } from "./child.types";

export interface Profile {
  id: number;
  email: string;
  phone: string;
  firstName: string;
  lastName: string;
  address: string;
  children: Child[];
}
