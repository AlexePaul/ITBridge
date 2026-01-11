export interface Attendance {
  id: number;
  group: {
    id: number;
    weekday: number;
    startTime: string;
    endTime: string;
  };
  date: string;
  startTime: string;
  type: "regular" | "make-up";
  present: boolean;
}
