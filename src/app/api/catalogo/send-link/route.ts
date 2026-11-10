import { NextResponse } from "next/server";

import { isSameOriginPost } from "@/lib/catalogo-policy";
import { createClient } from "@/lib/supabase/server";

export async function POST(request: Request) {
  if (!isSameOriginPost(request)) {
    return NextResponse.json({ error: "Origen no permitido." }, { status: 403 });
  }

  const body = await request.json().catch(() => null);
  const email = typeof body?.email === "string" ? body.email.trim().toLowerCase() : "";
  if (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return NextResponse.json({ error: "Ingresa un correo válido." }, { status: 400 });
  }

  const allowed = (process.env.CATALOGO_ALLOWED_EMAILS ?? "")
    .split(",")
    .map((item) => item.trim().toLowerCase())
    .includes(email);
  if (!allowed) {
    return NextResponse.json({ ok: true }, { headers: { "Cache-Control": "no-store" } });
  }

  const supabase = await createClient();
  const redirectTo =
    process.env.CATALOGO_AUTH_CALLBACK_URL ??
    "https://viso.ventogroup.co/admin/catalogo/callback";
  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: { shouldCreateUser: false, emailRedirectTo: redirectTo },
  });

  if (error) {
    console.error("[catalogo] No se pudo enviar el enlace de acceso:", error.code);
    return NextResponse.json(
      { error: "No fue posible enviar el enlace. Inténtalo más tarde." },
      { status: error.status === 429 ? 429 : 503 },
    );
  }
  return NextResponse.json({ ok: true }, { headers: { "Cache-Control": "no-store" } });
}
