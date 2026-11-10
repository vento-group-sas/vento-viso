import type { Metadata } from "next";

import { CatalogoClient } from "./catalogo-client";
import { isAuthorizedCatalogUser } from "@/lib/catalogo-policy";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "Administrar catálogo | Vento Group",
  robots: { index: false, follow: false },
};

export default async function CatalogoAdminPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const supabase = await createClient();
  const { data } = await supabase.auth.getUser();
  const user = data.user;
  const params = await searchParams;
  return (
    <CatalogoClient
      authorized={isAuthorizedCatalogUser(user)}
      currentEmail={user?.email ?? null}
      invalidLink={params.error === "invalid-link"}
    />
  );
}
