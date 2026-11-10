import { NextRequest, NextResponse } from "next/server";

import { isAuthorizedCatalogUser } from "@/lib/catalogo-policy";
import { createClient } from "@/lib/supabase/server";

export async function GET(request: NextRequest) {
  const code = request.nextUrl.searchParams.get("code");
  const destination = new URL("/admin/catalogo", request.url);
  if (!code) {
    destination.searchParams.set("error", "invalid-link");
    return NextResponse.redirect(destination);
  }

  const supabase = await createClient();
  const { data, error } = await supabase.auth.exchangeCodeForSession(code);
  if (error || !isAuthorizedCatalogUser(data.user)) {
    if (data.user) await supabase.auth.signOut();
    destination.searchParams.set("error", "invalid-link");
    return NextResponse.redirect(destination);
  }
  return NextResponse.redirect(destination);
}
