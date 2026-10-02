/** Zona waktu aplikasi PDC (selaras backend WIB). */
export const APP_TIMEZONE = "Asia/Jakarta";

/** Tanggal kalender hari ini di Jakarta sebagai YYYY-MM-DD. */
export function todayIsoDateInJakarta(): string {
  return new Intl.DateTimeFormat("sv-SE", {
    timeZone: APP_TIMEZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

const dateTimeFmt = new Intl.DateTimeFormat("en-GB", {
  timeZone: APP_TIMEZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
});

/** Parts → DD/MM/YYYY HH:mm (WIB). */
export function formatJakartaDateTimeParts(d: Date): string {
  const parts = dateTimeFmt.formatToParts(d);
  const get = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((p) => p.type === type)?.value ?? "";
  const dd = get("day");
  const mm = get("month");
  const yyyy = get("year");
  const hh = get("hour");
  const min = get("minute");
  return `${dd}/${mm}/${yyyy} ${hh}:${min}`;
}

/** Ms epoch → tanggal kalender Jakarta YYYY-MM-DD. */
export function jakartaIsoDateFromMs(ms: number): string {
  const d = new Date(ms);
  return new Intl.DateTimeFormat("sv-SE", {
    timeZone: APP_TIMEZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(d);
}
