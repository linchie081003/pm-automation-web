export type UserNoticeVariant = "success" | "error" | "info";

export function parseUserNotice(message: string): {
  category: string | null;
  body: string;
} {
  const trimmed = message.trim();
  const match = trimmed.match(/^\[([^\]]+)\]\s*(.*)$/);
  if (!match) {
    return { category: null, body: trimmed };
  }
  const body = match[2].trim();
  return { category: match[1].trim(), body: body || match[1].trim() };
}

export function inferNoticeVariant(
  message: string,
  explicit?: UserNoticeVariant,
): UserNoticeVariant {
  if (explicit) return explicit;
  const { category } = parseUserNotice(message);
  if (category) {
    const c = category.toLowerCase();
    if (
      c.includes("tidak valid") ||
      c.includes("ditolak") ||
      c.includes("tidak ditemukan") ||
      c.includes("server") ||
      c.includes("login") ||
      c.includes("kesalahan")
    ) {
      return "error";
    }
    return "error";
  }
  if (message.includes("HTTP") || /gagal/i.test(message)) return "error";
  return "success";
}
