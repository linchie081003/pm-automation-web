/** Normalisasi ke YYYY-MM-DD (input type=date & API). */
export function toDateInputValue(raw: string | null | undefined): string {
  if (raw == null || raw === "") return "";
  const s = String(raw).trim();
  const iso = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;
  const dmy = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (dmy) {
    const dd = dmy[1].padStart(2, "0");
    const mm = dmy[2].padStart(2, "0");
    return `${dmy[3]}-${mm}-${dd}`;
  }
  if (s.length >= 10 && s[4] === "-") return s.slice(0, 10);
  return "";
}

/** Tampilan konsisten: DD/MM/YYYY (Indonesia). */
export function formatDisplayDate(raw: string | null | undefined): string {
  if (raw == null || raw === "") return "—";
  const iso = toDateInputValue(raw);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) return String(raw);
  const [y, m, d] = iso.split("-");
  return `${d}/${m}/${y}`;
}

/** Dari timestamp (ms) ke DD/MM/YYYY — sama dengan formatDisplayDate. */
export function formatDisplayDateFromMs(ms: number): string {
  const d = new Date(ms);
  if (Number.isNaN(d.getTime())) return "—";
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return formatDisplayDate(`${y}-${m}-${day}`);
}
