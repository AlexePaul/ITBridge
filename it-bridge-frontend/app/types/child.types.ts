export interface Child {
  id: string;
  parent: {
    id: string;
    email: string;
    phone: string;
    firstName: string;
    lastName: string;
    address: string;
  };
  firstName: string;
  lastName: string;
  birthDate: string;
  createdAt: string;
  group?: {
    id: string;
    weekday: number;
    startTime: string;
    endTime: string;
  };
}
