export function normalizeName(name: string): string {
  if (typeof name !== "string" || name.length === 0) {
    return "";
  }

  return name.charAt(0).toUpperCase() + name.slice(1).toLowerCase();
}

export function formatTime(time: string): string {
  return time.slice(0, 5); // HH:mm from HH:mm:ss
}

export function getWeekdayName(weekday: number): string {
  const days = ["Luni", "Marți", "Miercuri", "Joi", "Vineri", "Sâmbătă", "Duminică"];
  return days[weekday - 1] || "Necunoscut";
}
