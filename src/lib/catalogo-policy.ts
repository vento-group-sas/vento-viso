import type { User } from "@supabase/supabase-js";

export const CATALOGO_BUCKET = "documents";
export const CATALOGO_FILE = "catalogo-navidad.pdf";
export const CATALOGO_MAX_BYTES = 25 * 1024 * 1024;

export function isAuthorizedCatalogUser(user: User | null | undefined): boolean {
  if (!user?.email || !user.email_confirmed_at) return false;
  const allowed = (process.env.CATALOGO_ALLOWED_EMAILS ?? "")
    .split(",")
    .map((email) => email.trim().toLowerCase())
    .filter(Boolean);
  return allowed.includes(user.email.trim().toLowerCase());
}

export function isSameOriginPost(request: Request): boolean {
  const origin = request.headers.get("origin");
  if (!origin) return false;
  try {
    return new URL(origin).origin === new URL(request.url).origin;
  } catch {
    return false;
  }
}

export function isValidPendingCatalogPath(path: unknown, userId: string): path is string {
  if (typeof path !== "string") return false;
  const prefix = "catalogo-pending/" + userId + "/";
  if (!path.startsWith(prefix)) return false;
  return /^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}\.pdf$/i.test(
    path.slice(prefix.length),
  );
}

export function isValidPdfBytes(bytes: Uint8Array): boolean {
  if (bytes.byteLength < 12 || bytes.byteLength > CATALOGO_MAX_BYTES) return false;
  const header = Buffer.from(bytes.subarray(0, 5)).toString("ascii");
  const footer = Buffer.from(bytes.subarray(-2048)).toString("latin1");
  return header === "%PDF-" && footer.includes("%%EOF");
}
