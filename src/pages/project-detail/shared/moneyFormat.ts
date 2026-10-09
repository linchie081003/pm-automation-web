export function formatIdr(n: number): string {
  return n.toLocaleString("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 });
}

export function formatRupiah(n: number) {
  return new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency: "IDR",
    maximumFractionDigits: 0,
  }).format(n);
}

export function parseRupiahDigits(s: string) {
  return Number(String(s).replace(/\D/g, "")) || 0;
}

export function formatRupiahDigits(n: number) {
  if (!n) return "";
  return new Intl.NumberFormat("id-ID").format(n);
}

export function poFieldClean(v: string | null | undefined): string {
  if (v == null) return "";
  const t = v.trim();
  return t === "-" ? "" : t;
}
