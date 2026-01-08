export interface Group {
  id: number;
  weekday: number;
  startTime: string;
  endTime: string;
  minAge: number;
  maxAge: number;
}
//might be nice, will look into it later.
/*
export interface GroupWithChildren extends Group {
  children: Array<{
    id: number;
    firstName: string;
    lastName: string;
  }>;
}
*/
