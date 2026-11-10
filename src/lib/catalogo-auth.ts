import "server-only";

import { createClient } from "@/lib/supabase/server";
import { isAuthorizedCatalogUser } from "@/lib/catalogo-policy";

export async function getCatalogEditor() {
  const supabase = await createClient();
  const { data, error } = await supabase.auth.getUser();
  if (error || !isAuthorizedCatalogUser(data.user)) return null;
  return data.user;
}
