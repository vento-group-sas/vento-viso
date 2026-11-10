import test from "node:test";
import assert from "node:assert/strict";

import {
  CATALOGO_MAX_BYTES,
  isAuthorizedCatalogUser,
  isSameOriginPost,
  isValidPendingCatalogPath,
  isValidPdfBytes,
} from "../../src/lib/catalogo-policy.ts";

test("solo los correos verificados de la lista permitida tienen acceso", () => {
  const original = process.env.CATALOGO_ALLOWED_EMAILS;
  process.env.CATALOGO_ALLOWED_EMAILS = "correo1@example.com,correo2@example.com";
  try {
    assert.equal(isAuthorizedCatalogUser({ email: "CORREO1@example.com", email_confirmed_at: "2026-01-01" }), true);
    assert.equal(isAuthorizedCatalogUser({ email: "correo1@example.com", email_confirmed_at: null }), false);
    assert.equal(isAuthorizedCatalogUser({ email: "otro@example.com", email_confirmed_at: "2026-01-01" }), false);
    assert.equal(isAuthorizedCatalogUser(null), false);
  } finally {
    if (original === undefined) delete process.env.CATALOGO_ALLOWED_EMAILS;
    else process.env.CATALOGO_ALLOWED_EMAILS = original;
  }
});

test("las escrituras requieren el mismo origen", () => {
  const makeRequest = (origin) =>
    new Request("https://viso.ventogroup.co/api/catalogo/confirm", {
      method: "POST",
      headers: origin ? { Origin: origin } : {},
    });
  assert.equal(isSameOriginPost(makeRequest("https://viso.ventogroup.co")), true);
  assert.equal(isSameOriginPost(makeRequest("https://evil.example.com")), false);
  assert.equal(isSameOriginPost(makeRequest(undefined)), false);
});

test("el archivo temporal debe pertenecer al usuario", () => {
  const user = "08cbd03e-19b3-4b1c-8a0d-d065208d3749";
  const prefix = "catalogo-pending/" + user + "/";
  assert.equal(isValidPendingCatalogPath(prefix + "c5e886c3-3a79-431b-8e51-b90f2d0f39aa.pdf", user), true);
  assert.equal(isValidPendingCatalogPath("../catalogo-navidad.pdf", user), false);
  assert.equal(isValidPendingCatalogPath(prefix + "../../catalogo-navidad.pdf", user), false);
  assert.equal(isValidPendingCatalogPath("catalogo-pending/otro/c5e886c3-3a79-431b-8e51-b90f2d0f39aa.pdf", user), false);
});

test("el nuevo catálogo debe tener firma PDF y tamaño permitido", () => {
  const good = Buffer.from("%PDF-1.7\n1 0 obj\n<<>>\nendobj\n%%EOF\n");
  assert.equal(isValidPdfBytes(good), true);
  assert.equal(isValidPdfBytes(Buffer.from("esto no es un pdf")), false);
  assert.equal(isValidPdfBytes(Buffer.from("%PDF-1.7\nSIN FINAL")), false);
  assert.equal(isValidPdfBytes(Buffer.alloc(CATALOGO_MAX_BYTES + 1)), false);
});

test("el callback conserva la cookie PKCE antes de canjear el enlace", async () => {
  const { readFileSync } = await import("node:fs");
  const middleware = readFileSync(new URL("../../middleware.ts", import.meta.url), "utf8");
  const bypass = middleware.indexOf('if (isCatalogoAdmin) {');
  const keepVerifier = middleware.indexOf('return withDebugHeaders(NextResponse.next(), request, "catalogo-pkce")');
  const sessionRead = middleware.indexOf("const result = await supabase.auth.getUser()");
  assert.ok(bypass >= 0 && keepVerifier > bypass && sessionRead > keepVerifier);
  assert.ok(!middleware.slice(bypass, keepVerifier).includes("clearSupabaseCookies"));
});
