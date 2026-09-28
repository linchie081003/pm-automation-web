import { isMutationMethod, mutationBusyEnd, mutationBusyStart } from "./lib/mutationBusy";

const TOKEN_KEY = "pdc_access_token";

export function getErrorMessage(err: unknown): string {
  if (err instanceof Error) return err.message;
  if (typeof err === "string") return err;
  return "Terjadi kesalahan yang tidak diketahui.";
}

function parseDetailField(detail: unknown): string {
  if (detail == null) return "";
  if (typeof detail === "string") return detail;
  if (Array.isArray(detail)) {
    return detail
      .map((item) => {
        if (typeof item === "string") return item;
        if (item && typeof item === "object") {
          const o = item as { msg?: string; loc?: (string | number)[]; type?: string };
          const field =
            Array.isArray(o.loc) && o.loc.length
              ? o.loc.filter((x) => x !== "body").join(".")
              : "";
          const msg = o.msg || JSON.stringify(item);
          return field ? `${field}: ${msg}` : msg;
        }
        return String(item);
      })
      .join(" · ");
  }
  if (typeof detail === "object") {
    const o = detail as Record<string, unknown>;
    if (typeof o.message === "string") return o.message;
    if (typeof o.msg === "string") return o.msg;
  }
  try {
    return JSON.stringify(detail);
  } catch {
    return String(detail);
  }
}

/** Build user-facing message from HTTP error response. */
export function formatApiError(
  status: number,
  _path: string,
  body: unknown,
  fallbackText: string,
): string {
  let core = fallbackText;
  if (body && typeof body === "object") {
    const record = body as { detail?: unknown; message?: string };
    if (record.detail !== undefined) {
      core = parseDetailField(record.detail) || fallbackText;
    } else if (typeof record.message === "string") {
      core = record.message;
    }
  } else if (typeof body === "string" && body.trim()) {
    core = body.trim().slice(0, 300);
  }

  const statusHint =
    status === 401
      ? "Sesi login tidak valid atau habis"
      : status === 403
        ? "Akses ditolak"
        : status === 404
          ? "Data tidak ditemukan"
          : status === 422
            ? "Data tidak valid"
            : status >= 500
              ? "Kesalahan server"
              : `HTTP ${status}`;

  return `[${statusHint}] ${core}`;
}

async function readErrorBody(res: Response): Promise<unknown> {
  const text = await res.text();
  if (!text) return {};
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return text;
  }
}

export function getToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}

export function setToken(token: string | null) {
  if (token) localStorage.setItem(TOKEN_KEY, token);
  else localStorage.removeItem(TOKEN_KEY);
}

export async function api<T>(
  path: string,
  options: RequestInit = {},
): Promise<T> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(options.headers as Record<string, string>),
  };
  const token = getToken();
  if (token) headers.Authorization = `Bearer ${token}`;

  const trackBusy = isMutationMethod(options.method);
  if (trackBusy) mutationBusyStart();
  try {
    let res: Response;
    try {
      res = await fetch(`/api${path}`, { ...options, headers });
    } catch {
      throw new Error(
        `[Jaringan] Tidak dapat menghubungi API. Pastikan backend (uvicorn) dan Vite proxy jalan. (${path})`,
      );
    }

    if (res.status === 401) {
      const body = await readErrorBody(res);
      const msg = formatApiError(401, path, body, "Unauthorized");
      const clickupIntegration = path.startsWith("/integrations/clickup");
      if (!clickupIntegration) {
        setToken(null);
        window.location.href = "/login";
      }
      throw new Error(msg);
    }
    if (!res.ok) {
      const body = await readErrorBody(res);
      const msg = formatApiError(res.status, path, body, res.statusText);
      throw new Error(msg);
    }
    if (res.status === 204) return undefined as T;
    return res.json() as Promise<T>;
  } finally {
    if (trackBusy) mutationBusyEnd();
  }
}

/** Fetch file bytes with JWT (for preview or custom handling). */
export async function fetchFileBlob(
  apiPath: string,
): Promise<{ blob: Blob; filename: string }> {
  const token = getToken();
  const headers: Record<string, string> = {};
  if (token) headers.Authorization = `Bearer ${token}`;

  mutationBusyStart();
  try {
    let res: Response;
    try {
      res = await fetch(`/api${apiPath}`, { headers });
    } catch {
      throw new Error(`[Jaringan] Tidak dapat mengambil file. (${apiPath})`);
    }
    if (res.status === 401) {
      setToken(null);
      window.location.href = "/login";
      throw new Error("Unauthorized");
    }
    if (!res.ok) {
      const body = await readErrorBody(res);
      throw new Error(formatApiError(res.status, apiPath, body, res.statusText));
    }
    const blob = await res.blob();
    const filename =
      res.headers.get("Content-Disposition")?.match(/filename="?([^";]+)"?/)?.[1] ||
      "file";
    return { blob, filename };
  } finally {
    mutationBusyEnd();
  }
}

/** Open preview in new tab (PDF/image) or trigger download (Office). */
export async function previewFile(apiPath: string): Promise<void> {
  const { blob, filename } = await fetchFileBlob(apiPath);
  const ext = filename.split(".").pop()?.toLowerCase() ?? "";
  const url = URL.createObjectURL(blob);
  if (ext === "pdf" || ext === "png" || ext === "jpg" || ext === "jpeg") {
    window.open(url, "_blank", "noopener,noreferrer");
    window.setTimeout(() => URL.revokeObjectURL(url), 120_000);
    return;
  }
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

/** Download binary file with JWT (plain anchor cannot send Authorization). */
export async function downloadFile(apiPath: string, filename?: string): Promise<void> {
  const token = getToken();
  const headers: Record<string, string> = {};
  if (token) headers.Authorization = `Bearer ${token}`;

  mutationBusyStart();
  try {
    let res: Response;
    try {
      res = await fetch(`/api${apiPath}`, { headers });
    } catch {
      throw new Error(`[Jaringan] Unduh gagal — periksa koneksi API. (${apiPath})`);
    }

    if (res.status === 401) {
      const body = await readErrorBody(res);
      const msg = formatApiError(401, apiPath, body, "Unauthorized");
      setToken(null);
      window.location.href = "/login";
      throw new Error(msg);
    }
    if (!res.ok) {
      const body = await readErrorBody(res);
      const msg = formatApiError(res.status, apiPath, body, res.statusText);
      throw new Error(msg);
    }
    const blob = await res.blob();
    const name =
      filename ||
      res.headers.get("Content-Disposition")?.match(/filename="?([^";]+)"?/)?.[1] ||
      "download";
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = name;
    a.click();
    URL.revokeObjectURL(url);
  } finally {
    mutationBusyEnd();
  }
}
