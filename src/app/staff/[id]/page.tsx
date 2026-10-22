import Link from "next/link";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";

import { PageHeader } from "@/components/vento/standard/page-header";
import { StaffPhotoPanel } from "@/components/viso/staff-photo-panel";
import {
  StaffPermissionsPanel,
  type StaffEmployeePermission,
  type StaffPermissionOption,
} from "@/components/viso/staff-permissions-panel";
import { StaffDocumentsPanel } from "@/components/viso/staff-documents-panel";
import { StaffAreaPurposePanel } from "@/components/viso/staff-area-purpose-panel";
import { StaffInventoryLocationPanel } from "@/components/viso/staff-inventory-location-panel";
import { Table, TableBody, TableCell, TableHead, TableHeaderCell, TableRow } from "@/components/vento/standard/table";
import { requireAppAccess } from "@/lib/auth/guard";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

type SiteRow = {
  id: string;
  name: string | null;
  code: string | null;
};

type RoleRow = {
  code: string;
  name: string;
};

type EmployeeRow = {
  id: string;
  full_name: string | null;
  alias: string | null;
  document_type: string | null;
  document_number: string | null;
  role: string | null;
  is_active: boolean | null;
  site_id: string | null;
  photo_url: string | null;
  pin_code_hash?: string | null;
};

type EmployeeSiteRow = {
  site_id: string;
  is_primary: boolean | null;
  is_active: boolean | null;
  site?: { id: string; name: string | null; code: string | null } | { id: string; name: string | null; code: string | null }[] | null;
};

type AttendanceStatusRow = {
  employee_id: string;
  current_status: "check_in" | "check_out" | null;
  last_action_at: string | null;
  last_site_id: string | null;
};

type AttendanceLogRow = {
  id: string;
  action: "check_in" | "check_out";
  occurred_at: string;
  source: string | null;
  accuracy_meters: number | null;
  site_id: string | null;
  site?: { id: string; name: string | null; code: string | null } | { id: string; name: string | null; code: string | null }[] | null;
};

type ShiftRow = {
  id: string;
  shift_date: string;
  start_time: string;
  end_time: string;
  break_minutes: number | null;
  notes: string | null;
  status: string;
  site_id: string;
  published_at?: string | null;
  site?: { id: string; name: string | null; code: string | null } | { id: string; name: string | null; code: string | null }[] | null;
};

type AreaRow = {
  id: string;
  site_id: string | null;
  name: string | null;
  kind: string | null;
  is_active: boolean | null;
};

type InventoryLocationRow = {
  id: string;
  site_id: string | null;
  area_id: string | null;
  code: string | null;
  description: string | null;
  zone: string | null;
  location_type: string | null;
  is_active: boolean | null;
};

type EmployeeInventoryLocationAssignmentRow = {
  id: string;
  employee_id: string;
  site_id: string;
  location_id: string;
  purpose: "kiosk_withdraw";
  is_active: boolean | null;
  location?: {
    id: string;
    site_id: string | null;
    area_id: string | null;
    code: string | null;
    description: string | null;
    zone: string | null;
  } | {
    id: string;
    site_id: string | null;
    area_id: string | null;
    code: string | null;
    description: string | null;
    zone: string | null;
  }[] | null;
};

type AreaKindRow = {
  code: string;
  use_for_remission: boolean | null;
};

type SiteAreaPurposeRuleRow = {
  site_id: string | null;
  area_kind: string | null;
  purpose: string | null;
  is_enabled: boolean | null;
};

type EmployeeAreaPurposeAssignmentRow = {
  id: string;
  employee_id: string;
  site_id: string;
  area_id: string;
  purpose: "operational" | "remission";
  is_active: boolean | null;
  area?: { id: string; site_id: string | null; name: string | null; kind: string | null } | { id: string; site_id: string | null; name: string | null; kind: string | null }[] | null;
};

type StaffAreaPurposeAssignmentResult =
  | {
      ok: true;
      siteId: string;
      purpose: "operational" | "remission";
      areaId: string | null;
    }
  | {
      ok: false;
      error: string;
    };


type StaffInventoryLocationAssignmentResult =
  | {
      ok: true;
      siteId: string;
      locationId: string | null;
    }
  | {
      ok: false;
      error: string;
    };

const PHOTO_MIME_EXTENSIONS: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};

const PHOTO_BUCKET = "employee-photos";
const STAFF_PHOTO_STORAGE_PREFIX = "staff";
const STAFF_PHOTO_MAX_BYTES = 5 * 1024 * 1024;

function normalizePhotoMime(value: string) {
  const mime = value.trim().toLowerCase();
  return PHOTO_MIME_EXTENSIONS[mime] ? mime : "";
}

function isSafeStaffPhotoPath(storagePath: string, employeeId: string, extension: string) {
  const expectedPrefix = `${STAFF_PHOTO_STORAGE_PREFIX}/${employeeId}/`;
  return (
    storagePath.startsWith(expectedPrefix) &&
    storagePath.length > expectedPrefix.length &&
    storagePath.length <= 500 &&
    !storagePath.includes("..") &&
    !storagePath.includes("//") &&
    storagePath.toLowerCase().endsWith(`.${extension}`)
  );
}

const DOCUMENT_BUCKET = "documents";
const STAFF_DOCUMENT_STORAGE_PREFIX = "viso";
const STAFF_DOCUMENT_MAX_BYTES = 20 * 1024 * 1024;

function sanitizeStaffDocumentFileName(value: string) {
  const raw = value.trim() || "documento.pdf";
  const withoutAccents = raw.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  const cleaned = withoutAccents
    .replace(/[\/\\]/g, "_")
    .replace(/\s+/g, "_")
    .replace(/[^a-zA-Z0-9._-]/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 120);
  const safe = cleaned || "documento.pdf";
  return safe.toLowerCase().endsWith(".pdf") ? safe : `${safe}.pdf`;
}

function normalizePdfMime(value: string) {
  const mime = value.trim().toLowerCase() || "application/pdf";
  if (mime === "application/octet-stream") return "application/pdf";
  if (mime === "application/pdf" || mime === "application/x-pdf") return mime;
  return "";
}

function asPositiveInteger(value: FormDataEntryValue | null) {
  if (typeof value !== "string") return 0;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) return 0;
  return parsed;
}

function isSafeStaffDocumentPath(storagePath: string, employeeId: string) {
  const expectedPrefix = `${STAFF_DOCUMENT_STORAGE_PREFIX}/${employeeId}/`;
  return (
    storagePath.startsWith(expectedPrefix) &&
    storagePath.length > expectedPrefix.length &&
    storagePath.length <= 500 &&
    !storagePath.includes("..") &&
    !storagePath.includes("//") &&
    storagePath.toLowerCase().endsWith(".pdf")
  );
}

function asText(value: FormDataEntryValue | null) {
  return typeof value === "string" ? value.trim() : "";
}

type StaffGlobalAccess = {
  authClient: Awaited<ReturnType<typeof requireAppAccess>>["supabase"];
  supabase: ReturnType<typeof createAdminClient>;
  isSharedDevice: boolean;
  operatorId: string;
  actualRole: string | null;
};

// The admin client bypasses RLS: authorize the operator's active site and
// the target's active assignment BEFORE accessing employee-wide data.
// Cross-site access additionally requires proven, effective GLOBAL scope.
async function requireStaffEmployeeSiteAccess(employeeId: string, permissionCode: string) {
  const returnTo = `/staff/${employeeId}`;
  const access = await requireAppAccess({
    appId: "viso",
    returnTo,
    permissionCode,
  });
  const operatorSiteId = String(access.siteId ?? "").trim();
  const deny = (): never => {
    const params = new URLSearchParams({
      returnTo,
      reason: "staff_site_scope_denied",
      permission: `viso.${permissionCode}`,
    });
    redirect(`/no-access?${params.toString()}`);
  };

  // Site IDs interpolate into PostgREST OR filters: validate both the
  // operational site and any cross-site fallback before returning either.
  const isUuid = (value: string) =>
    /^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i.test(value);
  if (!employeeId || !isUuid(operatorSiteId)) deny();

  const supabase = createAdminClient();
  const isSharedDevice = access.operationalSession.isSharedDevice;

  // A human operator must belong actively to the operational session's site.
  // A shared device can only act at its trusted device site.
  if (!isSharedDevice) {
    const { data: operatorSite, error: operatorSiteError } = await supabase
      .from("employee_sites")
      .select("employee_id")
      .eq("employee_id", access.user.id)
      .eq("site_id", operatorSiteId)
      .eq("is_active", true)
      .maybeSingle();
    if (operatorSiteError || !operatorSite) deny();
  }

  const { data: targetSite, error: targetSiteError } = await supabase
    .from("employee_sites")
    .select("employee_id")
    .eq("employee_id", employeeId)
    .eq("site_id", operatorSiteId)
    .eq("is_active", true)
    .maybeSingle();
  if (targetSiteError) deny();

  let authorizedSiteId = operatorSiteId;
  if (!targetSite) {
    // Never promote site-only grants (or a shared device) to cross-site access.
    if (isSharedDevice) deny();
    await requireStaffGlobalPermission({
      authClient: access.supabase,
      supabase,
      isSharedDevice,
      operatorId: access.user.id,
      actualRole: access.operationalSession.role,
    }, permissionCode);

    // Choose one deterministic ACTIVE assignment of the target. This does
    // not confer access to other sites or to inactive assignments.
    const { data: foreignSite, error: foreignSiteError } = await supabase
      .from("employee_sites")
      .select("site_id")
      .eq("employee_id", employeeId)
      .eq("is_active", true)
      .order("is_primary", { ascending: false })
      .order("site_id", { ascending: true })
      .limit(1)
      .maybeSingle();
    const candidateSiteId = String(foreignSite?.site_id ?? "").trim();
    if (foreignSiteError || !isUuid(candidateSiteId)) deny();

    // A global grant does not override a possible effective denial for this
    // destination. Re-evaluate the authenticated actor with the target site.
    const { data: sitePermission, error: sitePermissionError } = await access.supabase.rpc(
      "has_permission", {
        p_permission_code: `viso.${permissionCode}`,
        p_site_id: candidateSiteId,
        p_area_id: null,
      }
    );
    if (sitePermissionError || sitePermission !== true) deny();
    authorizedSiteId = candidateSiteId;
  }

  return {
    authClient: access.supabase,
    supabase,
    authorizedSiteId,
    isSharedDevice,
    operatorId: access.user.id,
    actualRole: access.operationalSession.role,
    // Historical NULL-site documents remain employee-wide; explicit site IDs
    // are confined to the authorized target assignment only.
    documentSiteFilter: `site_id.is.null,site_id.eq.${authorizedSiteId}`,
  };
}

function asBool(value: FormDataEntryValue | null) {
  return value === "on" || value === "true";
}

function safeDecode(value: string | null | undefined) {
  if (!value) return "";
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

function formatDateTime(value: string | null | undefined) {
  if (!value) return "-";
  try {
    return new Intl.DateTimeFormat("es-CO", {
      timeZone: "America/Bogota",
      dateStyle: "short",
      timeStyle: "short",
    }).format(new Date(value));
  } catch {
    return value;
  }
}

function asNumber(value: FormDataEntryValue | null, fallback = 0) {
  if (typeof value !== "string" || value.trim() === "") return fallback;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

// A NULL site argument in has_permission DOES NOT prove a global grant:
// PostgreSQL can return true for a site-only employee grant. Verify the
// explicit scope provenance under the real operator and role as well.
async function requireStaffGlobalPermission(
  access: StaffGlobalAccess,
  permissionCode: string,
  probeOnly = false,
) {
  // The read-only probe is for visibility of GLOBAL rows only.
  // All mutation guards use the default and keep redirect-on-denial.
  const deny = (): boolean => {
    if (probeOnly) return false;
    redirect(
      `/no-access?reason=staff_global_scope_denied&permission=${encodeURIComponent(
        `viso.${permissionCode}`
      )}`
    );
  };
  if (access.isSharedDevice || !access.operatorId) return deny();

  const { data: effective, error: effectiveError } = await access.authClient.rpc("has_permission", {
    p_permission_code: `viso.${permissionCode}`,
    p_site_id: null,
    p_area_id: null,
  });
  if (effectiveError || effective !== true) return deny();

  const { data: app, error: appError } = await access.supabase
    .from("apps")
    .select("id")
    .eq("code", "viso")
    .maybeSingle();
  if (appError || !app) return deny();

  const { data: permission, error: permissionError } = await access.supabase
    .from("app_permissions")
    .select("id")
    .eq("app_id", app.id)
    .eq("code", permissionCode)
    .maybeSingle();
  if (permissionError || !permission) return deny();

  const [{ data: employeeGlobal, error: employeeError },
    { data: roleGlobal, error: roleError }] = await Promise.all([
    access.supabase
      .from("employee_permissions")
      .select("id")
      .eq("employee_id", access.operatorId)
      .eq("permission_id", permission.id)
      .eq("is_allowed", true)
      .eq("scope_type", "global")
      .is("scope_site_id", null)
      .is("scope_area_id", null)
      .is("scope_site_type", null)
      .is("scope_area_kind", null)
      .limit(1)
      .maybeSingle(),
    access.actualRole
      ? access.supabase
        .from("role_permissions")
        .select("permission_id")
        .eq("role", access.actualRole)
        .eq("permission_id", permission.id)
        .eq("is_allowed", true)
        .or("scope_type.eq.global,scope_type.is.null")
        .is("scope_site_id", null)
        .is("scope_area_id", null)
        .is("scope_site_type", null)
        .is("scope_area_kind", null)
        .limit(1)
        .maybeSingle()
      : Promise.resolve({ data: null, error: null }),
  ]);

  if (employeeError || roleError || (!employeeGlobal && !roleGlobal)) return deny();
  return true;
}

// Include only the active operator's site grants unless its *explicit*
// GLOBAL staff.permissions.manage provenance was verified. A null site alone
// is never treated as a global grant.
function employeePermissionScopeFilter(authorizedSiteId: string, allowGlobal: boolean) {
  const local = `scope_site_id.eq.${authorizedSiteId}`;
  return allowGlobal
    ? `${local},and(scope_type.eq.global,scope_site_id.is.null,scope_area_id.is.null,scope_site_type.is.null,scope_area_kind.is.null)`
    : local;
}

async function requireStaffAdministrativeSiteAccess(
  employeeId: string,
  permissionCode: string,
  requestedSiteId?: string,
  requireActiveAssignment = true,
) {
  const access = await requireStaffEmployeeSiteAccess(employeeId, permissionCode);
  if (requestedSiteId && requestedSiteId !== access.authorizedSiteId) {
    // A GLOBAL grant never bypasses an effective denial for the destination.
    // Validate the requested site before any privileged mutation.
    if (!/^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i.test(requestedSiteId)) {
      redirect("/no-access?reason=staff_target_site_invalid");
    }
    await requireStaffGlobalPermission(access, permissionCode);
    const { data: targetPermission, error: targetPermissionError } = await access.authClient.rpc(
      "has_permission", {
        p_permission_code: `viso.${permissionCode}`,
        p_site_id: requestedSiteId,
        p_area_id: null,
      }
    );
    if (targetPermissionError || targetPermission !== true) {
      redirect("/no-access?reason=staff_target_site_permission_denied");
    }
    if (requireActiveAssignment) {
      const { data: assignment, error } = await access.supabase
        .from("employee_sites")
        .select("employee_id")
        .eq("employee_id", employeeId)
        .eq("site_id", requestedSiteId)
        .eq("is_active", true)
        .maybeSingle();
      if (error || !assignment) {
        redirect("/no-access?reason=staff_target_site_inactive");
      }
    }
  }
  return access;
}

async function saveEmployeeAreaPurposeAssignment(formData: FormData): Promise<StaffAreaPurposeAssignmentResult> {
  "use server";
  const employeeId = asText(formData.get("employee_id"));
  const siteId = asText(formData.get("site_id"));
  const purposeRaw = asText(formData.get("purpose")).toLowerCase();
  const purpose = purposeRaw === "remission" ? "remission" : "operational";
  const areaId = asText(formData.get("area_id"));

  if (!employeeId || !siteId) {
    return { ok: false, error: "Faltan empleado o sede para asignar área." };
  }

  const { supabase } = await requireStaffAdministrativeSiteAccess(employeeId, "staff.manage", siteId);

  if (!areaId) {
    const { error: delError } = await supabase
      .from("employee_area_purpose_assignments")
      .delete()
      .eq("employee_id", employeeId)
      .eq("site_id", siteId)
      .eq("purpose", purpose);

    if (delError) {
      return { ok: false, error: delError.message };
    }

    revalidatePath(`/staff/${employeeId}`);
    revalidatePath("/staff");
    return { ok: true, siteId, purpose, areaId: null };
  }

  const { data: areaCheck, error: areaCheckError } = await supabase
    .from("areas")
    .select("id,site_id,is_active")
    .eq("id", areaId)
    .maybeSingle();

  if (areaCheckError || !areaCheck) {
    return { ok: false, error: "Área inválida." };
  }

  if (String(areaCheck.site_id ?? "") !== siteId || areaCheck.is_active !== true) {
    return { ok: false, error: "El área no está activa en la sede autorizada." };
  }

  const { error } = await supabase.from("employee_area_purpose_assignments").upsert(
    {
      employee_id: employeeId,
      site_id: siteId,
      area_id: areaId,
      purpose,
      is_active: true,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "employee_id,site_id,purpose" }
  );

  if (error) {
    return { ok: false, error: error.message };
  }

  revalidatePath(`/staff/${employeeId}`);
  revalidatePath("/staff");
  return { ok: true, siteId, purpose, areaId };
}

async function saveEmployeeInventoryLocationAssignment(formData: FormData): Promise<StaffInventoryLocationAssignmentResult> {
  "use server";
  const employeeId = asText(formData.get("employee_id"));
  const siteId = asText(formData.get("site_id"));
  const locationId = asText(formData.get("location_id"));

  if (!employeeId || !siteId) {
    return { ok: false, error: "Faltan trabajador o sede para asignar LOC." };
  }

  const { supabase } = await requireStaffAdministrativeSiteAccess(employeeId, "staff.manage", siteId);

  if (!locationId) {
    const { error: delError } = await supabase
      .from("employee_inventory_location_assignments")
      .delete()
      .eq("employee_id", employeeId)
      .eq("site_id", siteId)
      .eq("purpose", "kiosk_withdraw");

    if (delError) {
      return { ok: false, error: delError.message };
    }

    revalidatePath(`/staff/${employeeId}`);
    revalidatePath("/staff");
    return { ok: true, siteId, locationId: null };
  }

  const { data: locationCheck, error: locationCheckError } = await supabase
    .from("inventory_locations")
    .select("id,site_id,is_active")
    .eq("id", locationId)
    .maybeSingle();

  if (locationCheckError || !locationCheck) {
    return { ok: false, error: "LOC inválido." };
  }

  if (String(locationCheck.site_id ?? "") !== siteId || locationCheck.is_active !== true) {
    return { ok: false, error: "El LOC no está activo en la sede autorizada." };
  }

  const { error } = await supabase.from("employee_inventory_location_assignments").upsert(
    {
      employee_id: employeeId,
      site_id: siteId,
      location_id: locationId,
      purpose: "kiosk_withdraw",
      is_active: true,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "employee_id,site_id,purpose" }
  );

  if (error) {
    return { ok: false, error: error.message };
  }

  revalidatePath(`/staff/${employeeId}`);
  revalidatePath("/staff");
  return { ok: true, siteId, locationId };
}

async function setEmployeeKioskPin(formData: FormData) {
  "use server";
  const employeeId = asText(formData.get("employee_id"));
  const pin = asText(formData.get("pin"));

  if (!employeeId) {
    redirect("/staff?error=" + encodeURIComponent("Trabajador inválido."));
  }

  if (!/^[0-9]{4,8}$/.test(pin)) {
    redirect(`/staff/${employeeId}?error=${encodeURIComponent("El PIN debe tener entre 4 y 8 digitos.")}`);
  }

  const access = await requireStaffEmployeeSiteAccess(employeeId, "staff.manage");
  await requireStaffGlobalPermission(access, "staff.manage");
  const { supabase } = access;

  const { error } = await supabase.rpc("set_employee_kiosk_pin", {
    p_employee_id: employeeId,
    p_pin: pin,
  });

  if (error) {
    redirect(`/staff/${employeeId}?error=${encodeURIComponent(error.message)}`);
  }

  revalidatePath(`/staff/${employeeId}`);
  revalidatePath("/staff");
  redirect(`/staff/${employeeId}?ok=kiosk_pin_saved`);
}

async function updateEmployee(formData: FormData) {
  "use server";
  const id = asText(formData.get("id"));
  const fullName = asText(formData.get("full_name"));
  const alias = asText(formData.get("alias"));
  const documentType = asText(formData.get("document_type")) || "CC";
  const documentNumber = asText(formData.get("document_number"));
  const role = asText(formData.get("role"));
  const siteId = asText(formData.get("site_id"));
  const isActive = asBool(formData.get("is_active"));

  if (!id || !fullName || !role || !siteId) {
    redirect(`/staff/${id}?error=${encodeURIComponent("Faltan campos obligatorios.")}`);
  }

  const access = await requireStaffAdministrativeSiteAccess(id, "staff.manage", siteId);
  // Role, activation and identity are shared across all employee sites.
  await requireStaffGlobalPermission(access, "staff.manage");
  const { supabase } = access;

  const { data: changed, error } = await supabase
    .from("employees")
    .update({
      full_name: fullName,
      alias: alias || null,
      document_type: documentType,
      document_number: documentNumber || null,
      role,
      site_id: siteId,
      is_active: isActive,
    })
    .eq("id", id)
    .select("id");

  if (error || !changed?.length) {
    redirect(`/staff/${id}?error=${encodeURIComponent(
      error?.message ?? "No se actualizó ningún trabajador autorizado."
    )}`);
  }

  revalidatePath(`/staff/${id}`);
  revalidatePath("/staff");
  redirect("/staff?ok=" + encodeURIComponent("Trabajador actualizado."));
}

async function deleteEmployee(formData: FormData) {
  "use server";
  const id = asText(formData.get("id"));
  if (!id) redirect("/staff?error=" + encodeURIComponent("Empleado inválido."));

  const access = await requireStaffEmployeeSiteAccess(id, "staff.manage");
  await requireStaffGlobalPermission(access, "staff.manage");
  const { supabase } = access;

  const { data: deleted, error } = await supabase
    .from("employees").delete().eq("id", id).select("id");
  if (error || !deleted?.length) {
    redirect(`/staff/${id}?error=${encodeURIComponent(
      error?.message ?? "No se eliminó ningún trabajador autorizado."
    )}`);
  }

  revalidatePath("/staff");
  redirect("/staff?ok=deleted");
}

async function addEmployeeSite(formData: FormData) {
  "use server";
  const employeeId = asText(formData.get("employee_id"));
  const siteId = asText(formData.get("site_id"));
  const makePrimary = asBool(formData.get("is_primary"));

  if (!employeeId || !siteId) {
    redirect(`/staff/${employeeId}?error=${encodeURIComponent("Selecciona una sede.")}`);
  }

  const access = await requireStaffAdministrativeSiteAccess(employeeId, "staff.manage", siteId, false);
  if (makePrimary) await requireStaffGlobalPermission(access, "staff.manage");
  const { supabase } = access;

  const { data: employeeRow, error: employeeFetchError } = await supabase
    .from("employees")
    .select("site_id")
    .eq("id", employeeId)
    .maybeSingle();

  if (employeeFetchError) {
    redirect(`/staff/${employeeId}?error=${encodeURIComponent(employeeFetchError.message)}`);
  }

  const currentPrimarySiteId = String(employeeRow?.site_id ?? "").trim();

  const { error } = await supabase.from("employee_sites").upsert(
    {
      employee_id: employeeId,
      site_id: siteId,
      is_primary: false,
      is_active: true,
    },
    { onConflict: "employee_id,site_id" },
  );

  if (error) {
    redirect(`/staff/${employeeId}?error=${encodeURIComponent(error.message)}`);
  }

  const nextPrimarySiteId = makePrimary ? siteId : currentPrimarySiteId || siteId;
  const { data: assignedPrimary, error: primaryError } = await supabase
    .from("employees")
    .update({ site_id: nextPrimarySiteId, updated_at: new Date().toISOString() })
    .eq("id", employeeId)
    .select("id");

  if (primaryError || !assignedPrimary?.length) {
    redirect(`/staff/${employeeId}?error=${encodeURIComponent(
      primaryError?.message ?? "No se actualizó la sede principal."
    )}`);
  }

  revalidatePath(`/staff/${employeeId}`);
  redirect(`/staff/${employeeId}?ok=site_added`);
}

async function setPrimarySite(formData: FormData) {
  "use server";
  const employeeId = asText(formData.get("employee_id"));
  const siteId = asText(formData.get("site_id"));

  if (!employeeId || !siteId) {
    redirect(`/staff/${employeeId}?error=${encodeURIComponent("Sede invalida.")}`);
  }

  const access = await requireStaffAdministrativeSiteAccess(employeeId, "staff.manage", siteId);
  await requireStaffGlobalPermission(access, "staff.manage");
  const { supabase } = access;

  const { data: primaryUpdated, error } = await supabase
    .from("employees")
    .update({ site_id: siteId, updated_at: new Date().toISOString() })
    .eq("id", employeeId)
    .select("id");

  if (error || !primaryUpdated?.length) {
    redirect(`/staff/${employeeId}?error=${encodeURIComponent(
      error?.message ?? "No se modificó la sede principal."
    )}`);
  }

  revalidatePath(`/staff/${employeeId}`);
  redirect(`/staff/${employeeId}?ok=primary_set`);
}

async function toggleEmployeeSite(formData: FormData) {
  "use server";
  const employeeId = asText(formData.get("employee_id"));
  const siteId = asText(formData.get("site_id"));
  const nextActive = asBool(formData.get("is_active"));

  const { supabase } = await requireStaffAdministrativeSiteAccess(employeeId, "staff.manage", siteId, false);

  const { data: employeeRow, error: employeeFetchError } = await supabase
    .from("employees")
    .select("site_id")
    .eq("id", employeeId)
    .maybeSingle();

  if (employeeFetchError) {
    redirect(`/staff/${employeeId}?error=${encodeURIComponent(employeeFetchError.message)}`);
  }

  const currentPrimarySiteId = String(employeeRow?.site_id ?? "").trim();

  const { data: changedSite, error } = await supabase
    .from("employee_sites")
    .update({ is_active: nextActive })
    .eq("employee_id", employeeId)
    .eq("site_id", siteId)
    .select("employee_id");

  if (error || !changedSite?.length) {
    redirect(`/staff/${employeeId}?error=${encodeURIComponent(
      error?.message ?? "Asignación de sede no encontrada."
    )}`);
  }

  if (nextActive && currentPrimarySiteId && currentPrimarySiteId !== siteId) {
    const { error: restorePrimaryError } = await supabase
      .from("employees")
      .update({ site_id: currentPrimarySiteId, updated_at: new Date().toISOString() })
      .eq("id", employeeId);

    if (restorePrimaryError) {
      redirect(`/staff/${employeeId}?error=${encodeURIComponent(restorePrimaryError.message)}`);
    }
  }

  revalidatePath(`/staff/${employeeId}`);
  redirect(`/staff/${employeeId}?ok=site_updated`);
}

async function removeEmployeeSite(formData: FormData) {
  "use server";
  const employeeId = asText(formData.get("employee_id"));
  const siteId = asText(formData.get("site_id"));

  const { supabase } = await requireStaffAdministrativeSiteAccess(employeeId, "staff.manage", siteId, false);

  const { data: removedSite, error } = await supabase
    .from("employee_sites")
    .delete()
    .eq("employee_id", employeeId)
    .eq("site_id", siteId)
    .select("employee_id");

  if (error || !removedSite?.length) {
    redirect(`/staff/${employeeId}?error=${encodeURIComponent(
      error?.message ?? "Asignación de sede no encontrada."
    )}`);
  }

  revalidatePath(`/staff/${employeeId}`);
  redirect(`/staff/${employeeId}?ok=site_removed`);
}

async function uploadStaffDocument(formData: FormData) {
  "use server";
  const employeeId = asText(formData.get("employee_id"));
  const documentTypeId = asText(formData.get("document_type_id"));
  const issueDate = asText(formData.get("issue_date"));
  const expiryDate = asText(formData.get("expiry_date"));
  const file = formData.get("file");
  const fileName = sanitizeStaffDocumentFileName(asText(formData.get("file_name")) || "documento.pdf");
  const fileSizeBytes = asPositiveInteger(formData.get("file_size_bytes"));
  const mime = normalizePdfMime(asText(formData.get("file_mime")) || "application/pdf");

  if (!employeeId || !documentTypeId) {
    return { ok: false, error: "Faltan empleado o tipo de documento." };
  }

  const { supabase, authorizedSiteId, documentSiteFilter } = await requireStaffEmployeeSiteAccess(
    employeeId, "staff.documents.manage"
  );
  let storagePath = "";

  const failAndCleanup = async (message: string) => {
    if (storagePath && isSafeStaffDocumentPath(storagePath, employeeId)) {
      await supabase.storage.from(DOCUMENT_BUCKET).remove([storagePath]);
    }

    return { ok: false, error: message };
  };

  const uploadedFile = file instanceof File ? file : null;

  if (!uploadedFile) {
    return await failAndCleanup("Selecciona un archivo PDF.");
  }
  const validFile = uploadedFile;

  if (!fileName.toLowerCase().endsWith(".pdf")) {
    return await failAndCleanup("Solo se permiten archivos PDF.");
  }

  if (!mime) {
    return await failAndCleanup("Solo se permiten archivos PDF.");
  }

  if (fileSizeBytes <= 0) {
    return await failAndCleanup("El archivo está vacío o no tiene tamaño válido.");
  }

  if (fileSizeBytes > STAFF_DOCUMENT_MAX_BYTES) {
    return await failAndCleanup("El PDF supera el límite permitido de 20 MB.");
  }

  if (validFile.size !== fileSizeBytes) {
    return await failAndCleanup("El tamaño del archivo no coincide.");
  }

  const { data: docType } = await supabase
    .from("document_types")
    .select("id,name,requires_expiry,validity_months,allow_multiple")
    .eq("id", documentTypeId)
    .eq("is_active", true)
    .maybeSingle();

  if (!docType) {
    return await failAndCleanup("Tipo de documento no encontrado.");
  }

  let issueDateValue: string | null = null;
  let expiryDateValue: string | null = null;

  if (docType.requires_expiry) {
    if (!issueDate) {
      return await failAndCleanup("Indica la fecha de expedición.");
    }

    let expiry: string | null = expiryDate || null;

    if (!expiry && docType.validity_months != null) {
      const d = new Date(issueDate);
      d.setMonth(d.getMonth() + Number(docType.validity_months));
      expiry = d.toISOString().slice(0, 10);
    }

    if (!expiry) {
      return await failAndCleanup("Indica la fecha de vencimiento.");
    }

    issueDateValue = issueDate;
    expiryDateValue = expiry;
  }

  storagePath = `${STAFF_DOCUMENT_STORAGE_PREFIX}/${employeeId}/${Date.now()}_${crypto.randomUUID()}_${fileName}`;

  if (!isSafeStaffDocumentPath(storagePath, employeeId)) {
    return await failAndCleanup("Ruta de archivo inválida.");
  }

  const { error: uploadError } = await supabase.storage
    .from(DOCUMENT_BUCKET)
    .upload(storagePath, validFile, {
      contentType: mime,
      cacheControl: "3600",
      upsert: false,
    });

  if (uploadError) {
    return await failAndCleanup("Error al subir el archivo: " + uploadError.message);
  }

  const insertPayload = {
    scope: "employee",
    owner_employee_id: employeeId,
    target_employee_id: employeeId,
    site_id: authorizedSiteId,
    title: docType.name ?? "Documento",
    description: null,
    storage_path: storagePath,
    file_name: fileName,
    file_size_bytes: fileSizeBytes,
    file_mime: mime,
    document_type_id: documentTypeId,
    issue_date: issueDateValue,
    expiry_date: expiryDateValue,
    status: "approved",
  };

  const { data: insertedDocument, error: insertError } = await supabase
    .from("documents")
    .insert(insertPayload)
    .select("id")
    .single();

  if (insertError) {
    await supabase.storage.from(DOCUMENT_BUCKET).remove([storagePath]);
    return { ok: false, error: "Error al registrar el documento: " + insertError.message };
  }

  if (docType.allow_multiple !== true) {
    const { data: previousDocs, error: previousDocsError } = await supabase
      .from("documents")
      .select("id,storage_path")
      .eq("target_employee_id", employeeId)
      .eq("document_type_id", documentTypeId)
      .neq("id", insertedDocument.id)
      .or(documentSiteFilter);

    if (previousDocsError) {
      return { ok: false, error: "Documento subido, pero no se pudo revisar duplicados: " + previousDocsError.message };
    }

    const previousIds = (previousDocs ?? []).map((doc) => doc.id).filter(Boolean);
    let deletedStoragePaths: string[] = [];
    if (previousIds.length > 0) {
      const { data: deletedPreviousDocs, error: deletePreviousError } = await supabase
        .from("documents")
        .delete()
        .in("id", previousIds)
        .eq("target_employee_id", employeeId)
        .or(documentSiteFilter)
        .select("id,storage_path");

      if (deletePreviousError) {
        return { ok: false, error: "Documento subido, pero no se pudo reemplazar el anterior: " + deletePreviousError.message };
      }
      if ((deletedPreviousDocs ?? []).length !== previousIds.length) {
        return { ok: false, error: "Documento subido, pero cambiaron las asignaciones de los documentos anteriores." };
      }
      // Delete only Storage objects from rows that were actually deleted.
      deletedStoragePaths = (deletedPreviousDocs ?? [])
        .map((doc) => (typeof doc.storage_path === "string" ? doc.storage_path : ""))
        .filter((path) => path && isSafeStaffDocumentPath(path, employeeId));
    }

    if (deletedStoragePaths.length > 0) {
      const { error: removePreviousFilesError } = await supabase.storage
        .from(DOCUMENT_BUCKET)
        .remove(deletedStoragePaths);

      if (removePreviousFilesError) {
        return {
          ok: false,
          error: "Documento reemplazado, pero no se pudo borrar el archivo anterior: " + removePreviousFilesError.message,
        };
      }
    }
  }

  revalidatePath(`/staff/${employeeId}`);
  return { ok: true };
}

async function updateStaffDocument(formData: FormData) {
  "use server";
  const documentId = asText(formData.get("document_id"));
  const employeeId = asText(formData.get("employee_id"));
  const documentAction = asText(formData.get("document_action"));
  const issueDateRaw = formData.get("issue_date");
  const expiryDateRaw = formData.get("expiry_date");
  const titleRaw = formData.get("title");
  const issueDate = typeof issueDateRaw === "string" ? issueDateRaw.trim() || null : null;
  const expiryDate = typeof expiryDateRaw === "string" ? expiryDateRaw.trim() || null : null;
  const title = typeof titleRaw === "string" ? titleRaw.trim() || null : null;

  if (!documentId || !employeeId) {
    redirect(`/staff/${employeeId}?error=${encodeURIComponent("Faltan documento o empleado.")}`);
  }

  const { supabase, documentSiteFilter } = await requireStaffEmployeeSiteAccess(
    employeeId, "staff.documents.manage"
  );

  if (documentAction === "delete") {
    const { data: docRow, error: findError } = await supabase
      .from("documents")
      .select("id,storage_path")
      .eq("id", documentId)
      .eq("target_employee_id", employeeId)
      .or(documentSiteFilter)
      .maybeSingle();

    if (findError) {
      redirect(`/staff/${employeeId}?error=${encodeURIComponent("Error al buscar el documento: " + findError.message)}`);
    }

    if (!docRow) {
      redirect(`/staff/${employeeId}?error=${encodeURIComponent("Documento no encontrado.")}`);
    }

    const storagePath = typeof docRow.storage_path === "string" ? docRow.storage_path : "";

    const { data: deletedDocs, error: deleteError } = await supabase
      .from("documents")
      .delete()
      .eq("id", documentId)
      .eq("target_employee_id", employeeId)
      .or(documentSiteFilter)
      .select("id");

    if (deleteError || !deletedDocs?.length) {
      redirect(`/staff/${employeeId}?error=${encodeURIComponent(
        deleteError ? "Error al eliminar el documento: " + deleteError.message : "Documento no encontrado en la sede autorizada."
      )}`);
    }

    if (storagePath && isSafeStaffDocumentPath(storagePath, employeeId)) {
      const { error: storageDeleteError } = await supabase.storage.from(DOCUMENT_BUCKET).remove([storagePath]);

      if (storageDeleteError) {
        redirect(
          `/staff/${employeeId}?error=${encodeURIComponent(
            "Documento eliminado, pero no se pudo borrar el archivo del Storage: " + storageDeleteError.message
          )}`
        );
      }
    }

    revalidatePath(`/staff/${employeeId}`);
    redirect(`/staff/${employeeId}?ok=document_deleted`);
  }

  const updates: { issue_date?: string | null; expiry_date?: string | null; title?: string | null } = {};
  if (issueDate !== undefined) updates.issue_date = issueDate;
  if (expiryDate !== undefined) updates.expiry_date = expiryDate;
  if (title !== undefined) updates.title = title;

  const { data: updatedDocs, error } = await supabase
    .from("documents")
    .update(updates)
    .eq("id", documentId)
    .eq("target_employee_id", employeeId)
    .or(documentSiteFilter)
    .select("id");

  if (error || !updatedDocs?.length) {
    redirect(`/staff/${employeeId}?error=${encodeURIComponent(
      error ? "Error al actualizar: " + error.message : "Documento no encontrado en la sede autorizada."
    )}`);
  }

  revalidatePath(`/staff/${employeeId}`);
  redirect(`/staff/${employeeId}?ok=document_updated`);
}

async function uploadStaffPhoto(formData: FormData) {
  "use server";
  const employeeId = asText(formData.get("employee_id"));
  const storagePath = asText(formData.get("storage_path"));
  const fileSizeBytes = asPositiveInteger(formData.get("file_size_bytes"));
  const mime = normalizePhotoMime(asText(formData.get("file_mime")));

  if (!employeeId) {
    redirect("/staff?error=" + encodeURIComponent("Trabajador inválido."));
  }

  const { supabase } = await requireStaffEmployeeSiteAccess(employeeId, "staff.employee_photos.manage");

  const failAndCleanup = async (message: string): Promise<never> => {
    // A caller-provided path is NOT proof that this request created the file.
    // Never grant an arbitrary Storage deletion through error cleanup.
    redirect(`/staff/${employeeId}?error=${encodeURIComponent(message)}`);
  };

  if (!mime) {
    return await failAndCleanup("Solo se permiten JPG, PNG o WebP.");
  }

  const extension = PHOTO_MIME_EXTENSIONS[mime];

  if (!extension) {
    return await failAndCleanup("Solo se permiten JPG, PNG o WebP.");
  }

  if (!storagePath || !isSafeStaffPhotoPath(storagePath, employeeId, extension)) {
    return await failAndCleanup("Ruta de foto inválida.");
  }

  if (fileSizeBytes <= 0) {
    return await failAndCleanup("La foto está vacía o no tiene tamaño válido.");
  }

  if (fileSizeBytes > STAFF_PHOTO_MAX_BYTES) {
    return await failAndCleanup("La foto supera 5 MB.");
  }

  const { data } = supabase.storage.from(PHOTO_BUCKET).getPublicUrl(storagePath);

  if (!data.publicUrl) {
    return await failAndCleanup("No se pudo obtener la URL pública de la foto.");
  }

  const { error } = await supabase
    .from("employees")
    .update({ photo_url: data.publicUrl })
    .eq("id", employeeId);

  if (error) {
    // Do not delete caller-supplied Storage objects using the admin client.
    redirect(`/staff/${employeeId}?error=${encodeURIComponent("Error al guardar la foto: " + error.message)}`);
  }

  revalidatePath(`/staff/${employeeId}`);
  revalidatePath("/staff");
  redirect(`/staff/${employeeId}?ok=photo_uploaded`);
}

async function grantEmployeePermission(formData: FormData) {
  "use server";
  const employeeId = asText(formData.get("employee_id"));
  const permissionId = asText(formData.get("permission_id"));
  const scopeTypeRaw = asText(formData.get("scope_type"));
  const scopeType = scopeTypeRaw === "site" ? "site" : "global";
  const isAllowed = asText(formData.get("is_allowed")) !== "false";

  if (!employeeId || !permissionId) {
    redirect(`/staff/${employeeId}?error=${encodeURIComponent("Faltan trabajador o permiso.")}`);
  }

  const access = await requireStaffEmployeeSiteAccess(employeeId, "staff.permissions.manage");
  if (scopeType === "global") {
    await requireStaffGlobalPermission(access, "staff.permissions.manage");
  }
  const { supabase, authorizedSiteId } = access;

  const { data: permission, error: permissionError } = await supabase
    .from("app_permissions")
    .select("id,code,app:apps(code)")
    .eq("id", permissionId)
    .maybeSingle();

  const app = Array.isArray(permission?.app) ? permission?.app[0] : permission?.app;
  const fullCode = app?.code && permission?.code ? `${app.code}.${permission.code}` : "";

  if (permissionError || !permission || !fullCode) {
    redirect(`/staff/${employeeId}?error=${encodeURIComponent("Permiso inválido o no encontrado.")}`);
  }

  // Never take a site-scope permission from the employee's OTHER primary
  // site; bind it to the operator's independently authorized site.
  const scopeSiteId: string | null = scopeType === "site" ? authorizedSiteId : null;

  let cleanup = supabase
    .from("employee_permissions")
    .delete()
    .eq("employee_id", employeeId)
    .eq("permission_id", permissionId)
    .eq("scope_type", scopeType);
  cleanup = scopeSiteId ? cleanup.eq("scope_site_id", scopeSiteId) : cleanup.is("scope_site_id", null);
  const { error: cleanupError } = await cleanup
    .is("scope_area_id", null)
    .is("scope_site_type", null)
    .is("scope_area_kind", null);

  if (cleanupError) {
    redirect(`/staff/${employeeId}?error=${encodeURIComponent(cleanupError.message)}`);
  }

  const { error } = await supabase.from("employee_permissions").insert({
    employee_id: employeeId,
    permission_id: permissionId,
    is_allowed: isAllowed,
    scope_type: scopeType,
    scope_site_id: scopeSiteId,
  });

  if (error) {
    redirect(`/staff/${employeeId}?error=${encodeURIComponent(error.message)}`);
  }

  revalidatePath(`/staff/${employeeId}`);
  redirect(`/staff/${employeeId}?ok=permission_saved`);
}

async function removeEmployeePermission(formData: FormData) {
  "use server";
  const employeeId = asText(formData.get("employee_id"));
  const permissionRowId = asText(formData.get("permission_row_id"));

  if (!employeeId || !permissionRowId) {
    redirect(`/staff/${employeeId}?error=${encodeURIComponent("Permiso inválido.")}`);
  }

  const access = await requireStaffEmployeeSiteAccess(employeeId, "staff.permissions.manage");
  const { supabase, authorizedSiteId } = access;
  const { data: existing, error: lookupError } = await supabase
    .from("employee_permissions")
    .select("id,scope_type,scope_site_id")
    .eq("id", permissionRowId)
    .eq("employee_id", employeeId)
    .maybeSingle();
  if (lookupError || !existing) {
    redirect(`/staff/${employeeId}?error=${encodeURIComponent("Permiso no encontrado.")}`);
  }
  if (existing.scope_type === "global" ||
      (existing.scope_site_id && existing.scope_site_id !== authorizedSiteId)) {
    await requireStaffGlobalPermission(access, "staff.permissions.manage");
  }
  let removal = supabase
    .from("employee_permissions")
    .delete()
    .eq("id", permissionRowId)
    .eq("employee_id", employeeId)
    .eq("scope_type", existing.scope_type);
  removal = existing.scope_site_id
    ? removal.eq("scope_site_id", existing.scope_site_id)
    : removal.is("scope_site_id", null);
  const { data: removed, error } = await removal.select("id");
  if (error || !removed?.length) {
    redirect(`/staff/${employeeId}?error=${encodeURIComponent(
      error?.message ?? "No se eliminó ningún permiso autorizado."
    )}`);
  }

  revalidatePath(`/staff/${employeeId}`);
  redirect(`/staff/${employeeId}?ok=permission_removed`);
}

async function createEmployeeShift(formData: FormData) {
  "use server";
  const employeeId = asText(formData.get("employee_id"));
  const siteId = asText(formData.get("site_id"));
  const shiftDate = asText(formData.get("shift_date"));
  const startTime = asText(formData.get("start_time"));
  const endTime = asText(formData.get("end_time"));

  if (!employeeId || !siteId || !shiftDate || !startTime || !endTime) {
    redirect(`/staff/${employeeId}?error=${encodeURIComponent("Completa fecha, sede y horario del turno.")}`);
  }

  const { supabase } = await requireStaffAdministrativeSiteAccess(employeeId, "staff.manage", siteId);

  const payload = {
    employee_id: employeeId,
    site_id: siteId,
    shift_date: shiftDate,
    start_time: startTime,
    end_time: endTime,
    break_minutes: Math.max(0, asNumber(formData.get("break_minutes"), 0)),
    status: asText(formData.get("status")) || "scheduled",
    notes: asText(formData.get("notes")) || null,
    published_at: null,
    published_by: null,
  };

  const { error } = await supabase.from("employee_shifts").insert(payload);

  if (error) {
    redirect(`/staff/${employeeId}?error=${encodeURIComponent(error.message)}`);
  }

  revalidatePath(`/staff/${employeeId}`);
  redirect(`/staff/${employeeId}?ok=shift_created`);
}

async function updateEmployeeShift(formData: FormData) {
  "use server";
  const employeeId = asText(formData.get("employee_id"));
  const shiftId = asText(formData.get("shift_id"));
  const siteId = asText(formData.get("site_id"));
  const shiftDate = asText(formData.get("shift_date"));
  const startTime = asText(formData.get("start_time"));
  const endTime = asText(formData.get("end_time"));

  if (!employeeId || !shiftId || !siteId || !shiftDate || !startTime || !endTime) {
    redirect(`/staff/${employeeId}?error=${encodeURIComponent("Faltan datos para actualizar el turno.")}`);
  }

  const { supabase } = await requireStaffAdministrativeSiteAccess(employeeId, "staff.manage", siteId);

  const { data: changedShifts, error } = await supabase
    .from("employee_shifts")
    .update({
      site_id: siteId,
      shift_date: shiftDate,
      start_time: startTime,
      end_time: endTime,
      break_minutes: Math.max(0, asNumber(formData.get("break_minutes"), 0)),
      status: asText(formData.get("status")) || "scheduled",
      notes: asText(formData.get("notes")) || null,
      published_at: null,
      published_by: null,
    })
    .eq("id", shiftId)
    .eq("employee_id", employeeId)
    .eq("site_id", siteId)
    .select("id");

  if (error || !changedShifts?.length) {
    redirect(`/staff/${employeeId}?error=${encodeURIComponent(
      error?.message ?? "Turno no encontrado en la sede autorizada."
    )}`);
  }

  revalidatePath(`/staff/${employeeId}`);
  redirect(`/staff/${employeeId}?ok=shift_updated`);
}

async function deleteEmployeeShift(formData: FormData) {
  "use server";
  const employeeId = asText(formData.get("employee_id"));
  const shiftId = asText(formData.get("shift_id"));

  if (!employeeId || !shiftId) {
    redirect(`/staff/${employeeId}?error=${encodeURIComponent("Turno inválido.")}`);
  }

  const { supabase, authorizedSiteId } = await requireStaffEmployeeSiteAccess(employeeId, "staff.manage");

  const { data: removedShifts, error } = await supabase
    .from("employee_shifts")
    .delete()
    .eq("id", shiftId)
    .eq("employee_id", employeeId)
    .eq("site_id", authorizedSiteId)
    .select("id");

  if (error || !removedShifts?.length) {
    redirect(`/staff/${employeeId}?error=${encodeURIComponent(
      error?.message ?? "Turno no encontrado en la sede autorizada."
    )}`);
  }

  revalidatePath(`/staff/${employeeId}`);
  redirect(`/staff/${employeeId}?ok=shift_deleted`);
}

export default async function StaffDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams?: Promise<{ ok?: string; error?: string }>;
}) {
  const sp = (await searchParams) ?? {};
  const okRaw = sp.ok ? safeDecode(sp.ok) : "";
  const okMsg =
    okRaw === "photo_uploaded"
      ? "Foto actualizada correctamente."
      : okRaw === "document_uploaded"
        ? "Documento subido correctamente."
        : okRaw === "document_updated"
          ? "Documento actualizado."
          : okRaw === "document_deleted"
            ? "Documento eliminado."
            : okRaw === "shift_created"
              ? "Turno creado."
              : okRaw === "shift_updated"
                ? "Turno actualizado."
                : okRaw === "shift_deleted"
                  ? "Turno eliminado."
                  : okRaw === "area_assignment_saved"
                    ? "Asignación de área guardada."
                    : okRaw === "inventory_location_assignment_saved"
                      ? "Asignacion de LOC guardada."
                      : okRaw === "kiosk_pin_saved"
                        ? "PIN de quiosco guardado."
                        : okRaw;
  const errorMsg = sp.error ? safeDecode(sp.error) : "";
  const { id } = await params;

  const staffAccess = await requireStaffEmployeeSiteAccess(id, "workforce.employees.view");
  const { authClient, supabase, authorizedSiteId, documentSiteFilter } = staffAccess;

  const [
    { data: employee },
    { data: sites },
    { data: roles },
    { data: employeeSites },
    { data: attendanceStatus },
    { data: attendanceLogs },
    { data: shifts },
    { data: areasData },
    { data: inventoryLocationsData },
    { data: areaKindsData },
    { data: siteAreaPurposeRulesData },
    { data: employeeAreaAssignmentsData },
    { data: employeeInventoryLocationAssignmentsData },
    ...restResults
  ] = await Promise.all([
    supabase
      .from("employees")
      .select("id,full_name,alias,document_type,document_number,role,is_active,site_id,photo_url,pin_code_hash")
      .eq("id", id)
      .maybeSingle(),
    supabase
      .from("sites")
      .select("id,name,code")
      .eq("id", authorizedSiteId)
      .order("name", { ascending: true }),
    supabase
      .from("roles")
      .select("code,name")
      .eq("is_active", true)
      .order("name", { ascending: true }),
    supabase
      .from("employee_sites")
      .select("site_id,is_primary,is_active,site:sites(id,name,code)")
      .eq("employee_id", id)
      .eq("site_id", authorizedSiteId)
      .order("is_primary", { ascending: false }),
    supabase
      .from("employee_attendance_status")
      .select("employee_id,current_status,last_action_at,last_site_id")
      .eq("employee_id", id)
      .eq("last_site_id", authorizedSiteId)
      .maybeSingle(),
    supabase
      .from("attendance_logs")
      .select("id,action,occurred_at,source,accuracy_meters,site_id,site:sites(id,name,code)")
      .eq("employee_id", id)
      .eq("site_id", authorizedSiteId)
      .order("occurred_at", { ascending: false })
      .limit(20),
    supabase
      .from("employee_shifts")
      .select("id,shift_date,start_time,end_time,break_minutes,notes,status,site_id,published_at,site:sites(id,name,code)")
      .eq("employee_id", id)
      .eq("site_id", authorizedSiteId)
      .order("shift_date", { ascending: true })
      .order("start_time", { ascending: true })
      .limit(40),
    supabase
      .from("areas")
      .select("id,site_id,name,kind,is_active")
      .eq("site_id", authorizedSiteId)
      .eq("is_active", true)
      .order("name", { ascending: true }),
    supabase
      .from("inventory_locations")
      .select("id,site_id,area_id,code,description,zone,location_type,is_active")
      .eq("site_id", authorizedSiteId)
      .eq("is_active", true)
      .order("description", { ascending: true })
      .order("code", { ascending: true }),
    supabase
      .from("area_kinds")
      .select("code,use_for_remission"),
    supabase
      .from("site_area_purpose_rules")
      .select("site_id,area_kind,purpose,is_enabled")
      .eq("site_id", authorizedSiteId)
      .eq("purpose", "remission")
      .eq("is_enabled", true),
    supabase
      .from("employee_area_purpose_assignments")
      .select("id,employee_id,site_id,area_id,purpose,is_active,area:areas(id,site_id,name,kind)")
      .eq("employee_id", id)
      .eq("site_id", authorizedSiteId)
      .eq("is_active", true),
    supabase
      .from("employee_inventory_location_assignments")
      .select("id,employee_id,site_id,location_id,purpose,is_active,location:inventory_locations(id,site_id,area_id,code,description,zone)")
      .eq("employee_id", id)
      .eq("site_id", authorizedSiteId)
      .eq("purpose", "kiosk_withdraw")
      .eq("is_active", true),
    supabase
      .from("documents")
      .select("id,title,status,issue_date,expiry_date,document_type:document_types(id,name)")
      .eq("target_employee_id", id)
      .or(documentSiteFilter)
      .order("updated_at", { ascending: false }),
    supabase.rpc("employee_wallet_eligibility", { p_employee_id: id }).maybeSingle(),
    supabase
      .from("document_types")
      .select("id,name,requires_expiry,validity_months,allow_multiple")
      .eq("is_active", true)
      .eq("scope", "employee")
      .order("name", { ascending: true }),
    supabase
      .from("app_permissions")
      .select("id,code,name,app:apps(code)")
      .order("code", { ascending: true }),
  ]);

  if (!employee) {
    redirect("/staff?error=" + encodeURIComponent("Empleado no encontrado."));
  }

  const [documentsPermission, photoPermission, permissionsPermission, managePermission] = await Promise.all([
    authClient.rpc("has_permission", { p_permission_code: "viso.staff.documents.manage", p_site_id: authorizedSiteId }),
    authClient.rpc("has_permission", { p_permission_code: "viso.staff.employee_photos.manage", p_site_id: authorizedSiteId }),
    authClient.rpc("has_permission", { p_permission_code: "viso.staff.permissions.manage", p_site_id: authorizedSiteId }),
    authClient.rpc("has_permission", { p_permission_code: "viso.staff.manage", p_site_id: authorizedSiteId }),
  ]);
  const canEditDocuments = !documentsPermission.error && Boolean(documentsPermission.data);
  const canEditPhoto = !photoPermission.error && Boolean(photoPermission.data);
  const canManagePermissions = !permissionsPermission.error && Boolean(permissionsPermission.data);
  const canManageStaff = !managePermission.error && Boolean(managePermission.data);
  const canReadGlobalEmployeePermissions = canManagePermissions &&
    await requireStaffGlobalPermission(staffAccess, "staff.permissions.manage", true);
  const { data: employeePermissionRows, error: employeePermissionError } = await supabase
    .from("employee_permissions")
    .select("id,is_allowed,scope_type,permission:app_permissions(id,code,name,app:apps(code))")
    .eq("employee_id", id)
    .or(employeePermissionScopeFilter(authorizedSiteId, canReadGlobalEmployeePermissions));

  const siteRows = (sites ?? []) as SiteRow[];
  const roleRows = (roles ?? []) as RoleRow[];
  const emp = employee as EmployeeRow;
  const siteLinks = (employeeSites ?? []) as EmployeeSiteRow[];
  const attendance = (attendanceStatus ?? null) as AttendanceStatusRow | null;
  const attendanceRows = (attendanceLogs ?? []) as AttendanceLogRow[];
  const shiftRows = (shifts ?? []) as ShiftRow[];
  const areaRows = (areasData ?? []) as AreaRow[];
  const inventoryLocationRows = (inventoryLocationsData ?? []) as InventoryLocationRow[];
  const areaKinds = (areaKindsData ?? []) as AreaKindRow[];
  const siteRemissionRules = (siteAreaPurposeRulesData ?? []) as SiteAreaPurposeRuleRow[];
  const employeeAreaAssignments = (employeeAreaAssignmentsData ?? []) as EmployeeAreaPurposeAssignmentRow[];
  const employeeInventoryLocationAssignments =
    (employeeInventoryLocationAssignmentsData ?? []) as EmployeeInventoryLocationAssignmentRow[];

  const areasBySite = areaRows.reduce((acc, row) => {
    const siteId = String(row.site_id ?? "").trim();
    if (!siteId) return acc;
    const current = acc[siteId] ?? [];
    current.push(row);
    acc[siteId] = current;
    return acc;
  }, {} as Record<string, AreaRow[]>);
  const remissionGlobalKinds = new Set(
    areaKinds
      .filter((kind) => Boolean(kind.use_for_remission))
      .map((kind) => String(kind.code ?? "").trim())
      .filter(Boolean)
  );
  const remissionKindsBySite = siteRemissionRules.reduce((acc, row) => {
    const siteId = String(row.site_id ?? "").trim();
    const kind = String(row.area_kind ?? "").trim();
    if (!siteId || !kind) return acc;
    const current = acc[siteId] ?? [];
    if (!current.includes(kind)) current.push(kind);
    acc[siteId] = current;
    return acc;
  }, {} as Record<string, string[]>);
  const assignmentBySitePurpose = employeeAreaAssignments.reduce((acc, row) => {
    const key = `${row.site_id}::${row.purpose}`;
    acc[key] = row;
    return acc;
  }, {} as Record<string, EmployeeAreaPurposeAssignmentRow>);
  const locationsBySite = inventoryLocationRows.reduce((acc, row) => {
    const siteId = String(row.site_id ?? "").trim();
    if (!siteId) return acc;
    const current = acc[siteId] ?? [];
    current.push(row);
    acc[siteId] = current;
    return acc;
  }, {} as Record<string, InventoryLocationRow[]>);
  const inventoryLocationAssignmentBySite = employeeInventoryLocationAssignments.reduce((acc, row) => {
    acc[String(row.site_id)] = row;
    return acc;
  }, {} as Record<string, EmployeeInventoryLocationAssignmentRow>);


  const areaPurposePanelSites = siteLinks.map((link) => {
    const site = Array.isArray(link.site) ? link.site[0] ?? null : link.site ?? null;
    const siteId = String(link.site_id ?? "").trim();

    return {
      siteId,
      siteName: site?.name ?? site?.code ?? siteId,
    };
  });

  const areaPurposePanelAreasBySite = Object.fromEntries(
    Object.entries(areasBySite).map(([siteId, rows]) => [
      siteId,
      rows
        .slice()
        .sort((a, b) =>
          String(a.name ?? a.kind ?? "").localeCompare(String(b.name ?? b.kind ?? ""), "es", { sensitivity: "base" })
        )
        .map((area) => ({
          id: area.id,
          label: area.name ?? area.kind ?? area.id,
        })),
    ])
  ) as Record<string, { id: string; label: string }[]>;

  const areaPurposePanelRemissionOptionsBySite = Object.fromEntries(
    siteLinks.map((link) => {
      const siteId = String(link.site_id ?? "").trim();
      const siteAreas = (areasBySite[siteId] ?? []).slice().sort((a, b) =>
        String(a.name ?? a.kind ?? "").localeCompare(String(b.name ?? b.kind ?? ""), "es", { sensitivity: "base" })
      );
      const siteRemissionKinds = remissionKindsBySite[siteId] ?? [];
      const remissionAllowed = siteRemissionKinds.length
        ? siteAreas.filter((area) => siteRemissionKinds.includes(String(area.kind ?? "").trim()))
        : siteAreas.filter((area) => remissionGlobalKinds.has(String(area.kind ?? "").trim()));
      const remissionOptions = remissionAllowed.length > 0 ? remissionAllowed : siteAreas;

      return [
        siteId,
        remissionOptions.map((area) => ({
          id: area.id,
          label: area.name ?? area.kind ?? area.id,
        })),
      ];
    })
  ) as Record<string, { id: string; label: string }[]>;

  const areaPurposePanelAssignments = Object.fromEntries(
    siteLinks.map((link) => {
      const siteId = String(link.site_id ?? "").trim();
      const operationalAssignment = assignmentBySitePurpose[`${siteId}::operational`];
      const remissionAssignment = assignmentBySitePurpose[`${siteId}::remission`];

      return [
        siteId,
        {
          operationalAreaId: operationalAssignment?.area_id ?? "",
          remissionAreaId: remissionAssignment?.area_id ?? "",
        },
      ];
    })
  ) as Record<string, { operationalAreaId: string; remissionAreaId: string }>;

  const inventoryLocationPanelSites = siteLinks.map((link) => {
    const site = Array.isArray(link.site) ? link.site[0] ?? null : link.site ?? null;
    const siteId = String(link.site_id ?? "").trim();

    return {
      siteId,
      siteName: site?.name ?? site?.code ?? siteId,
    };
  });

  const inventoryLocationPanelLocationsBySite = Object.fromEntries(
    Object.entries(locationsBySite).map(([siteId, rows]) => [
      siteId,
      rows
        .slice()
        .sort((a, b) =>
          String(a.description ?? a.zone ?? a.code ?? "").localeCompare(
            String(b.description ?? b.zone ?? b.code ?? ""),
            "es",
            { sensitivity: "base" }
          )
        )
        .map((location) => ({
          id: location.id,
          label: location.description || location.zone || location.code || location.id,
        })),
    ])
  ) as Record<string, { id: string; label: string }[]>;

  const inventoryLocationPanelAssignments = Object.fromEntries(
    siteLinks.map((link) => {
      const siteId = String(link.site_id ?? "").trim();
      const assignment = inventoryLocationAssignmentBySite[siteId];

      return [siteId, assignment?.location_id ?? ""];
    })
  ) as Record<string, string>;

  const attendanceLabel = attendance?.current_status === "check_in" ? "En turno" : attendance?.current_status === "check_out" ? "Fuera de turno" : "Sin registros";
  const primarySiteName =
    siteRows.find((site) => site.id === emp.site_id)?.name ??
    siteRows.find((site) => site.id === emp.site_id)?.code ??
    "Sin sede principal";
  const activeSiteCount = siteLinks.filter((link) => link.is_active !== false).length;
  const roleName = roleRows.find((role) => role.code === emp.role)?.name ?? emp.role ?? "Sin rol";

  const docsResult = restResults[0] as { data?: unknown[] | null } | undefined;
  const eligibilityResult = restResults[1] as { data?: unknown } | undefined;
  const documentTypesResult = restResults[2] as { data?: { id: string; name: string | null; requires_expiry: boolean | null; validity_months: number | null; allow_multiple: boolean | null }[] | null } | undefined;
  const availablePermissionsResult = restResults[3] as { data?: unknown[] | null } | undefined;
  const employeePermissionsResult = {
    data: employeePermissionError ? [] : employeePermissionRows,
  } as { data?: unknown[] | null };
  const documentTypesForSelect = (documentTypesResult?.data ?? []) as { id: string; name: string | null; requires_expiry: boolean | null; validity_months: number | null; allow_multiple: boolean | null }[];
  type RawPermissionOption = {
    id: string;
    code: string;
    name: string | null;
    app: { code: string } | { code: string }[] | null;
  };
  const availablePermissions = ((availablePermissionsResult?.data ?? []) as RawPermissionOption[])
    .map((item) => {
      const app = Array.isArray(item.app) ? item.app[0] ?? null : item.app;
      return {
        id: item.id,
        appCode: app?.code ?? "",
        code: item.code,
        name: item.name,
      };
    })
    .filter((item): item is StaffPermissionOption => Boolean(item.id && item.appCode && item.code))
    .sort((a, b) => `${a.appCode}.${a.code}`.localeCompare(`${b.appCode}.${b.code}`, "es"));
  type RawEmployeePermission = {
    id: string;
    is_allowed: boolean;
    scope_type: string;
    permission: RawPermissionOption | RawPermissionOption[] | null;
  };
  const employeePermissions = ((employeePermissionsResult?.data ?? []) as RawEmployeePermission[])
    .map((item) => {
      const permissionRaw = Array.isArray(item.permission) ? item.permission[0] ?? null : item.permission;
      const app = Array.isArray(permissionRaw?.app) ? permissionRaw?.app[0] ?? null : permissionRaw?.app;
      if (!permissionRaw || !app?.code) return null;
      const permission = {
        id: permissionRaw.id,
        appCode: app.code,
        code: permissionRaw.code,
        name: permissionRaw.name,
      };
      return {
        id: item.id,
        isAllowed: item.is_allowed,
        scopeType: item.scope_type,
        permission,
      };
    })
    .filter((item): item is StaffEmployeePermission => item !== null);
  const staffDocs = (docsResult?.data ?? []) as { id: string; title: string | null; status: string; issue_date: string | null; expiry_date: string | null; document_type: { id: string; name: string | null } | { id: string; name: string | null }[] | null }[];
  const staffDocsNormalized = staffDocs.map((d) => ({
    ...d,
    document_type: Array.isArray(d.document_type) ? d.document_type[0] ?? null : d.document_type,
  }));
  const eligibility = (eligibilityResult?.data ?? null) as {
    employee_id: string;
    contract_active: boolean;
    contract_document_id: string | null;
    contract_start_date: string | null;
    contract_end_date: string | null;
    documents_complete: boolean;
    missing_required_document_type_ids: string[] | null;
  } | null;
  const documentTypeNamesById: Record<string, string> = {};
  documentTypesForSelect.forEach((dt) => {
    documentTypeNamesById[dt.id] = dt.name ?? dt.id;
  });
  staffDocsNormalized.forEach((d) => {
    const dt = d.document_type;
    if (dt && typeof dt === "object" && "id" in dt && "name" in dt) {
      documentTypeNamesById[dt.id] = dt.name ?? dt.id;
    }
  });
  if (eligibility?.missing_required_document_type_ids) {
    eligibility.missing_required_document_type_ids.forEach((uuid) => {
      if (!documentTypeNamesById[uuid]) documentTypeNamesById[uuid] = "Documento requerido sin nombre";
    });
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Editar trabajador"
        subtitle="Actualiza datos, roles, sedes y administra asistencia y horarios."
        actions={
          <Link href="/staff" className="ui-btn ui-btn--ghost">
            Volver
          </Link>
        }
      />

      {errorMsg ? <div className="ui-alert ui-alert--error">{errorMsg}</div> : null}
      {okMsg ? <div className="ui-alert ui-alert--success">Listo: {okMsg}</div> : null}
      {!canManageStaff ? (
        <div className="ui-alert">
          Tienes acceso de lectura. Las acciones operativas del trabajador requieren el permiso viso.staff.manage.
        </div>
      ) : null}

      <div className="ui-panel ui-panel--accent-brand space-y-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h2 className="ui-h3">{emp.full_name ?? "Trabajador sin nombre"}</h2>
            <p className="ui-body-muted mt-1">
              {roleName} · {primarySiteName}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <span className={`ui-chip ${emp.is_active ? "ui-chip--success" : ""}`}>
              {emp.is_active ? "Activo" : "Inactivo"}
            </span>
            <span className="ui-chip">{activeSiteCount} sedes activas</span>
          </div>
        </div>

        <form action={updateEmployee} className="grid gap-4 lg:grid-cols-12">
          <input type="hidden" name="id" value={emp.id} />
          <label className="space-y-2 lg:col-span-5">
            <span className="ui-label">Nombre completo</span>
            <input name="full_name" className="ui-input" defaultValue={emp.full_name ?? ""} required />
          </label>
          <label className="space-y-2 lg:col-span-3">
            <span className="ui-label">Alias</span>
            <input name="alias" className="ui-input" defaultValue={emp.alias ?? ""} />
          </label>
          <label className="space-y-2 lg:col-span-2">
            <span className="ui-label">Tipo documento</span>
            <select name="document_type" className="ui-input" defaultValue={emp.document_type ?? "CC"}>
              <option value="CC">CC</option>
              <option value="CE">CE</option>
              <option value="TI">TI</option>
              <option value="PAS">Pasaporte</option>
              <option value="OTRO">Otro</option>
            </select>
          </label>
          <label className="space-y-2 lg:col-span-3">
            <span className="ui-label">Cédula</span>
            <input
              name="document_number"
              className="ui-input"
              defaultValue={emp.document_number ?? ""}
              placeholder="Número de identificación"
            />
          </label>
          <label className="space-y-2 lg:col-span-4">
            <span className="ui-label">Rol</span>
            <select name="role" className="ui-input" defaultValue={emp.role ?? ""} required>
              <option value="">Selecciona un rol</option>
              {roleRows.map((role) => (
                <option key={role.code} value={role.code}>
                  {role.name}
                </option>
              ))}
            </select>
          </label>
          <label className="space-y-2 lg:col-span-5">
            <span className="ui-label">Sede principal</span>
            <select name="site_id" className="ui-input" defaultValue={emp.site_id ?? ""} required>
              <option value="">Selecciona una sede</option>
              {siteRows.map((site) => (
                <option key={site.id} value={site.id}>
                  {site.name ?? site.code ?? site.id}
                </option>
              ))}
            </select>
          </label>
          <label className="flex items-center gap-2 text-sm text-[var(--ui-text)] lg:col-span-2 lg:pt-8">
            <input type="checkbox" name="is_active" defaultChecked={Boolean(emp.is_active)} />
            Activo
          </label>
          <div className="flex flex-wrap items-end justify-end gap-2 lg:col-span-5 lg:pt-6">
            <button type="submit" className="ui-btn ui-btn--brand">
              Guardar cambios
            </button>
          </div>
        </form>

        <div className="flex justify-end border-t border-[var(--ui-border)] pt-4">
          <form action={deleteEmployee}>
            <input type="hidden" name="id" value={emp.id} />
            <button type="submit" className="ui-btn ui-btn--danger">
              Eliminar trabajador
            </button>
          </form>
        </div>
      </div>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)]">
        <StaffPhotoPanel
          employeeId={emp.id}
          employeeName={emp.full_name}
          photoUrl={emp.photo_url}
          canEditPhoto={canEditPhoto}
          uploadPhotoAction={uploadStaffPhoto}
        />

        <StaffDocumentsPanel
          employeeId={emp.id}
          employeeName={emp.full_name}
          documents={staffDocsNormalized}
          eligibility={eligibility}
          documentTypeNamesById={documentTypeNamesById}
          documentTypes={documentTypesForSelect}
          uploadDocumentAction={uploadStaffDocument}
          canUploadDocuments={canEditDocuments}
          canEditDocuments={canEditDocuments}
          updateDocumentAction={updateStaffDocument}
        />
      </div>

      <StaffPermissionsPanel
        employeeId={emp.id}
        availablePermissions={availablePermissions}
        employeePermissions={employeePermissions}
        canManagePermissions={canManagePermissions}
        grantPermissionAction={grantEmployeePermission}
        removePermissionAction={removeEmployeePermission}
      />

      <div className="ui-panel space-y-4">
        <div className="ui-h3">Sedes asignadas</div>

        <form action={addEmployeeSite} className="grid gap-3 sm:grid-cols-[1fr_1fr_auto]">
          <input type="hidden" name="employee_id" value={emp.id} />
          <select name="site_id" className="ui-input">
            <option value="">Selecciona una sede</option>
            {siteRows.map((site) => (
              <option key={site.id} value={site.id}>
                {site.name ?? site.code ?? site.id}
              </option>
            ))}
          </select>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" name="is_primary" />
            Hacer principal
          </label>
          <button type="submit" className="ui-btn ui-btn--ghost">
            Agregar sede
          </button>
        </form>

        {siteLinks.length === 0 ? (
          <div className="ui-empty">Este trabajador no tiene sedes asignadas.</div>
        ) : (
          <div className="max-h-[420px] overflow-auto">
            <Table>
            <TableHead>
              <TableRow>
                <TableHeaderCell>Sede</TableHeaderCell>
                <TableHeaderCell>Estado</TableHeaderCell>
                <TableHeaderCell>Principal</TableHeaderCell>
                <TableHeaderCell></TableHeaderCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {siteLinks.map((link) => {
                const site = Array.isArray(link.site) ? link.site[0] ?? null : link.site ?? null;
                return (
                  <TableRow key={link.site_id}>
                    <TableCell>{site?.name ?? site?.code ?? link.site_id}</TableCell>
                    <TableCell>
                      <form action={toggleEmployeeSite} className="flex items-center gap-2">
                        <input type="hidden" name="employee_id" value={emp.id} />
                        <input type="hidden" name="site_id" value={link.site_id} />
                        <input type="hidden" name="is_active" value={String(!link.is_active)} />
                        <span className={`ui-chip ${link.is_active ? "ui-chip--success" : ""}`}>
                          {link.is_active ? "Activo" : "Inactivo"}
                        </span>
                        <button type="submit" className="ui-btn ui-btn--ghost ui-btn--sm">
                          {link.is_active ? "Desactivar" : "Activar"}
                        </button>
                      </form>
                    </TableCell>
                    <TableCell>
                      {link.is_primary ? (
                        <span className="ui-chip ui-chip--brand">Principal</span>
                      ) : (
                        <form action={setPrimarySite}>
                          <input type="hidden" name="employee_id" value={emp.id} />
                          <input type="hidden" name="site_id" value={link.site_id} />
                          <button type="submit" className="ui-btn ui-btn--ghost ui-btn--sm">
                            Hacer principal
                          </button>
                        </form>
                      )}
                    </TableCell>
                    <TableCell className="text-right">
                      <form action={removeEmployeeSite}>
                        <input type="hidden" name="employee_id" value={emp.id} />
                        <input type="hidden" name="site_id" value={link.site_id} />
                        <button type="submit" className="ui-btn ui-btn--ghost ui-btn--sm">
                          Quitar
                        </button>
                      </form>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
            </Table>
          </div>
        )}
      </div>

      <StaffAreaPurposePanel
        employeeId={emp.id}
        sites={areaPurposePanelSites}
        areasBySite={areaPurposePanelAreasBySite}
        remissionOptionsBySite={areaPurposePanelRemissionOptionsBySite}
        initialAssignments={areaPurposePanelAssignments}
        saveAssignmentAction={saveEmployeeAreaPurposeAssignment}
      />

      <div className="ui-panel space-y-4">
        <div>
          <div className="ui-h3">LOC de retiro NEXO</div>
          <p className="ui-body-muted">
            Define el destino fijo para retiros hechos desde el quiosco. El trabajador retira desde bodega y NEXO traslada al LOC asignado.
          </p>
        </div>
        <div className="rounded-2xl border border-[var(--ui-border)] bg-[var(--ui-bg-soft)] p-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <div className="text-sm font-semibold text-[var(--ui-text)]">PIN de quiosco</div>
              <div className="mt-1 text-sm text-[var(--ui-muted)]">
                Se usa para confirmar retiros desde la tablet. No se muestra despues de guardarlo.
              </div>
            </div>
            <span className={`ui-chip ${emp.pin_code_hash ? "ui-chip--success" : ""}`}>
              {emp.pin_code_hash ? "PIN activo" : "Sin PIN"}
            </span>
          </div>
          <form action={setEmployeeKioskPin} className="mt-4 flex flex-wrap items-end gap-2">
            <input type="hidden" name="employee_id" value={emp.id} />
            <label className="flex min-w-[220px] flex-1 flex-col gap-1">
              <span className="ui-label">Nuevo PIN</span>
              <input
                name="pin"
                type="password"
                inputMode="numeric"
                pattern="[0-9]{4,8}"
                className="ui-input"
                placeholder="4 a 8 digitos"
                autoComplete="off"
                required
              />
            </label>
            <button type="submit" className="ui-btn ui-btn--ghost">
              Guardar PIN
            </button>
          </form>
        </div>

        <StaffInventoryLocationPanel
          employeeId={emp.id}
          sites={inventoryLocationPanelSites}
          locationsBySite={inventoryLocationPanelLocationsBySite}
          initialAssignments={inventoryLocationPanelAssignments}
          saveAssignmentAction={saveEmployeeInventoryLocationAssignment}
        />
      </div>

      <div className="ui-panel space-y-4">
        <div className="ui-h3">Asistencia</div>
        <div className="flex flex-wrap items-center gap-3">
          <span className={`ui-chip ${attendance?.current_status === "check_in" ? "ui-chip--success" : ""}`}>
            {attendanceLabel}
          </span>
          <span className="ui-caption">Ultimo registro: {formatDateTime(attendance?.last_action_at)}</span>
        </div>

        {attendanceRows.length === 0 ? (
          <div className="ui-empty">No hay registros de asistencia para este trabajador.</div>
        ) : (
          <div className="max-h-[360px] overflow-auto">
            <Table>
            <TableHead>
              <TableRow>
                <TableHeaderCell>Fecha</TableHeaderCell>
                <TableHeaderCell>Acción</TableHeaderCell>
                <TableHeaderCell>Sede</TableHeaderCell>
                <TableHeaderCell>Origen</TableHeaderCell>
                <TableHeaderCell>Precision</TableHeaderCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {attendanceRows.map((row) => {
                const site = Array.isArray(row.site) ? row.site[0] ?? null : row.site ?? null;
                return (
                  <TableRow key={row.id}>
                    <TableCell>{formatDateTime(row.occurred_at)}</TableCell>
                    <TableCell>
                      <span className={`ui-chip ${row.action === "check_in" ? "ui-chip--success" : ""}`}>
                        {row.action === "check_in" ? "Entrada" : "Salida"}
                      </span>
                    </TableCell>
                    <TableCell>{site?.name ?? site?.code ?? row.site_id ?? "-"}</TableCell>
                    <TableCell>{row.source ?? "-"}</TableCell>
                    <TableCell>{row.accuracy_meters != null ? `${row.accuracy_meters} m` : "-"}</TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
            </Table>
          </div>
        )}
      </div>

      <div className="ui-panel space-y-4">
        <div className="ui-h3">Editor de horarios</div>
        <form action={createEmployeeShift} className="grid gap-3 lg:grid-cols-6">
          <input type="hidden" name="employee_id" value={emp.id} />
          <label className="space-y-2">
            <span className="ui-label">Fecha</span>
            <input name="shift_date" type="date" className="ui-input" required />
          </label>
          <label className="space-y-2">
            <span className="ui-label">Inicio</span>
            <input name="start_time" type="time" className="ui-input" required />
          </label>
          <label className="space-y-2">
            <span className="ui-label">Fin</span>
            <input name="end_time" type="time" className="ui-input" required />
          </label>
          <label className="space-y-2">
            <span className="ui-label">Descanso (min)</span>
            <input name="break_minutes" type="number" min="0" className="ui-input" defaultValue={0} />
          </label>
          <label className="space-y-2">
            <span className="ui-label">Estado</span>
            <select name="status" className="ui-input" defaultValue="scheduled">
              <option value="scheduled">Programado</option>
              <option value="confirmed">Confirmado</option>
              <option value="completed">Completado</option>
              <option value="cancelled">Cancelado</option>
              <option value="no_show">No asistio</option>
            </select>
          </label>
          <label className="space-y-2">
            <span className="ui-label">Sede</span>
            <select name="site_id" className="ui-input" defaultValue={emp.site_id ?? ""} required>
              <option value="">Selecciona una sede</option>
              {siteRows.map((site) => (
                <option key={site.id} value={site.id}>
                  {site.name ?? site.code ?? site.id}
                </option>
              ))}
            </select>
          </label>
          <label className="space-y-2 lg:col-span-5">
            <span className="ui-label">Notas</span>
            <input name="notes" className="ui-input" placeholder="Observaciones del turno, reemplazo, cobertura, etc." />
          </label>
          <div className="flex items-end">
            <button type="submit" className="ui-btn ui-btn--brand w-full">
              Crear turno
            </button>
          </div>
        </form>

        {shiftRows.length === 0 ? (
          <div className="ui-empty">No hay turnos programados para este trabajador.</div>
        ) : (
          <div className="max-h-[560px] overflow-auto">
            <Table>
            <TableHead>
              <TableRow>
                <TableHeaderCell>Fecha</TableHeaderCell>
                <TableHeaderCell>Horario</TableHeaderCell>
                <TableHeaderCell>Sede</TableHeaderCell>
                <TableHeaderCell>Descanso</TableHeaderCell>
                <TableHeaderCell>Estado</TableHeaderCell>
                <TableHeaderCell>Notas</TableHeaderCell>
                <TableHeaderCell></TableHeaderCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {shiftRows.map((shift) => {
                const site = Array.isArray(shift.site) ? shift.site[0] ?? null : shift.site ?? null;
                const formId = `shift-form-${shift.id}`;
                return (
                  <TableRow key={shift.id}>
                    <TableCell className="align-top">
                      <input
                        form={formId}
                        name="shift_date"
                        type="date"
                        className="ui-input min-w-[150px]"
                        defaultValue={shift.shift_date}
                        required
                      />
                    </TableCell>
                    <TableCell className="align-top">
                      <div className="flex gap-2">
                        <input
                          form={formId}
                          name="start_time"
                          type="time"
                          className="ui-input min-w-[116px]"
                          defaultValue={shift.start_time.slice(0, 5)}
                          required
                        />
                        <input
                          form={formId}
                          name="end_time"
                          type="time"
                          className="ui-input min-w-[116px]"
                          defaultValue={shift.end_time.slice(0, 5)}
                          required
                        />
                      </div>
                    </TableCell>
                    <TableCell className="align-top">
                      <select form={formId} name="site_id" className="ui-input min-w-[180px]" defaultValue={shift.site_id} required>
                        {siteRows.map((siteRow) => (
                          <option key={siteRow.id} value={siteRow.id}>
                            {siteRow.name ?? siteRow.code ?? siteRow.id}
                          </option>
                        ))}
                      </select>
                      <div className="ui-caption mt-2">{site?.name ?? site?.code ?? shift.site_id}</div>
                    </TableCell>
                    <TableCell className="align-top">
                      <input
                        form={formId}
                        name="break_minutes"
                        type="number"
                        min="0"
                        className="ui-input min-w-[110px]"
                        defaultValue={shift.break_minutes ?? 0}
                      />
                    </TableCell>
                    <TableCell className="align-top">
                      <select form={formId} name="status" className="ui-input min-w-[150px]" defaultValue={shift.status}>
                        <option value="scheduled">Programado</option>
                        <option value="confirmed">Confirmado</option>
                        <option value="completed">Completado</option>
                        <option value="cancelled">Cancelado</option>
                        <option value="no_show">No asistio</option>
                      </select>
                    </TableCell>
                    <TableCell className="align-top">
                      <input form={formId} name="notes" className="ui-input min-w-[220px]" defaultValue={shift.notes ?? ""} />
                    </TableCell>
                    <TableCell className="align-top">
                      <div className="flex flex-col gap-2">
                        <form id={formId} action={updateEmployeeShift} className="hidden">
                          <input type="hidden" name="employee_id" value={emp.id} />
                          <input type="hidden" name="shift_id" value={shift.id} />
                        </form>
                        <button type="submit" form={formId} className="ui-btn ui-btn--ghost ui-btn--sm">
                          Guardar
                        </button>
                        <form action={deleteEmployeeShift}>
                          <input type="hidden" name="employee_id" value={emp.id} />
                          <input type="hidden" name="shift_id" value={shift.id} />
                          <button type="submit" className="ui-btn ui-btn--ghost ui-btn--sm">
                            Eliminar
                          </button>
                        </form>
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
            </Table>
          </div>
        )}
      </div>
    </div>
  );
}
