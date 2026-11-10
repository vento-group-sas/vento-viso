import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";

import { getCatalogEditor } from "@/lib/catalogo-auth";
import {
  CATALOGO_BUCKET,
  CATALOGO_MAX_BYTES,
  isSameOriginPost,
} from "@/lib/catalogo-policy";
import { createAdminClient } from "@/lib/supabase/admin";

export async function POST(request: Request) {
  if (!isSameOriginPost(request)) {
    return NextResponse.json({ error: "Origen no permitido." }, { status: 403 });
  }
  const user = await getCatalogEditor();
  if (!user) return NextResponse.json({ error: "No autorizado." }, { status: 401 });

  const body = await request.json().catch(() => null);
  const filename = typeof body?.filename === "string" ? body.filename : "";
  const size = body?.size;
  if (!filename || filename.length > 255 || !/\.pdf$/i.test(filename) ||
      !Number.isSafeInteger(size) || size < 12 || size > CATALOGO_MAX_BYTES) {
    return NextResponse.json({ error: "Selecciona un PDF válido de máximo 25 MB." }, { status: 400 });
  }

  const path = "catalogo-pending/" + user.id + "/" + randomUUID() + ".pdf";
  const { data, error } = await createAdminClient().storage
    .from(CATALOGO_BUCKET)
    .createSignedUploadUrl(path);

  if (error || !data?.token) {
    return NextResponse.json({ error: "No se pudo preparar la subida." }, { status: 502 });
  }

  return NextResponse.json(
    { path, token: data.token },
    { headers: { "Cache-Control": "private, no-store" } },
  );
}
