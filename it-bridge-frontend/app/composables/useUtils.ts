export function normalizeName(name: string): string {
  if (typeof name !== "string" || name.length === 0) {
    return "";
  }

  return name
    .split(" ")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(" ");
}

export function formatTime(time: string): string {
  return time.slice(0, 5); // HH:mm from HH:mm:ss
}

export function getWeekdayName(weekday: number): string {
  const days = ["Luni", "Marți", "Miercuri", "Joi", "Vineri", "Sâmbătă", "Duminică"];
  return days[weekday - 1] || "Necunoscut";
}
