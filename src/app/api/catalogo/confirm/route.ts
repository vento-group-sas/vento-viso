import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";

import { getCatalogEditor } from "@/lib/catalogo-auth";
import {
  CATALOGO_BUCKET,
  CATALOGO_FILE,
  isSameOriginPost,
  isValidPdfBytes,
  isValidPendingCatalogPath,
} from "@/lib/catalogo-policy";
import { createAdminClient } from "@/lib/supabase/admin";

export async function POST(request: Request) {
  if (!isSameOriginPost(request)) {
    return NextResponse.json({ error: "Origen no permitido." }, { status: 403 });
  }
  const user = await getCatalogEditor();
  if (!user) return NextResponse.json({ error: "No autorizado." }, { status: 401 });

  const body = await request.json().catch(() => null);
  const path: unknown = body?.path;
  if (!isValidPendingCatalogPath(path, user.id)) {
    return NextResponse.json({ error: "Carga temporal inválida." }, { status: 400 });
  }

  const storage = createAdminClient().storage.from(CATALOGO_BUCKET);
  const { data: file, error: downloadError } = await storage.download(path);
  if (downloadError || !file) {
    return NextResponse.json({ error: "No se encontró el PDF cargado." }, { status: 400 });
  }

  const bytes = Buffer.from(await file.arrayBuffer());
  if (!isValidPdfBytes(bytes)) {
    await storage.remove([path]);
    return NextResponse.json({ error: "El archivo no contiene un PDF válido." }, { status: 415 });
  }

  const backupPath = "catalogo-backups/catalogo-navidad-" +
    new Date().toISOString().replace(/[:.]/g, "-") + "-" + randomUUID() + ".pdf";

  const { error: backupError } = await storage.copy(CATALOGO_FILE, backupPath);
  if (backupError) {
    return NextResponse.json(
      { error: "No se pudo crear la copia de seguridad; el catálogo sigue intacto." },
      { status: 502 },
    );
  }

  const { error: updateError } = await storage.update(CATALOGO_FILE, bytes, {
    contentType: "application/pdf",
    cacheControl: "60",
  });
  if (updateError) {
    return NextResponse.json(
      { error: "No se pudo reemplazar el catálogo; la copia anterior está conservada." },
      { status: 502 },
    );
  }

  const { error: cleanupError } = await storage.remove([path]);
  if (cleanupError) console.warn("[catalogo] Limpieza pendiente:", path);
  console.info("[catalogo] PDF reemplazado", {
    actorId: user.id,
    size: bytes.length,
    backupPath,
  });

  return NextResponse.json(
    { ok: true, url: "https://ventogroup.co/catalogo" },
    { headers: { "Cache-Control": "private, no-store" } },
  );
}
