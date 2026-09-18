import { cookies } from "next/headers";

import { checkPermissionWithRoleOverride } from "@/lib/auth/role-override";
import { checkOperationalRolePermission } from "@/lib/auth/operational-session";
import { createClient } from "@/lib/supabase/server";
import { VentoChrome } from "./vento-chrome";

type SiteRow = {
  id: string;
  name: string | null;
  site_type: string | null;
  operational_visibility?: string | null;
};

type EmployeeSiteRow = {
  site_id: string | null;
  is_primary: boolean | null;
};

type AttendanceLogRow = {
  action: string | null;
  site_id: string | null;
  shift_id: string | null;
  device_info: Record<string, unknown> | null;
};

type ShiftContextRow = {
  id: string;
  site_id: string | null;
  operational_role: string | null;
};

type ActiveWorkContext = {
  siteId: string;
  areaId: string;
  shiftId: string;
  operationalRole: string;
};

type SharedOperationalDeviceRow = {
  id: string;
  code: string;
  label: string;
  description: string | null;
  device_type: string;
  site_id: string;
  area_id: string | null;
  default_app_code: string;
  requires_actor_pin: boolean;
  requires_active_actor_shift: boolean;
  allow_actor_without_pin: boolean;
  allow_actions_without_actor: boolean;
  allowed_app_codes: string[] | null;
  metadata: Record<string, unknown> | null;
  navigation_role?: string | null;
};

type OperatingGateMode =
  | "anonymous"
  | "anima"
  | "privileged_bypass"
  | "personal_active_work"
  | "personal_no_work"
  | "shared_device";

type OperatingGate = {
  mode: OperatingGateMode;
  isBlocked: boolean;
  title: string;
  description: string;
  actionHref: string;
  actionLabel: string;
};

type AppStatus = "active" | "soon";
type AppAccess = "enabled" | "disabled" | "soon";

type AppSwitcherItem = {
  id: string;
  name: string;
  description: string;
  href: string;
  logoSrc: string;
  brandColor: string;
  status: AppStatus;
  access: AppAccess;
  group: "Workspace" | "Operacion" | "Proximamente";
};

type IconName =
  | "dashboard"
  | "accounting"
  | "users"
  | "calendar"
  | "store"
  | "sparkles"
  | "package"
  | "menu"
  | "fileText"
  | "briefcase"
  | "phone";

type NavigationRow = {
  group_label: string | null;
  group_order: number | null;
  label: string | null;
  description: string | null;
  href: string | null;
  icon: string | null;
  required_permission_code: string | null;
  sort_order: number | null;
};

type NavItem = {
  href: string;
  label: string;
  description?: string;
  icon?: IconName;
  permissionCode: string;
};

type NavGroup = {
  label: string;
  items: NavItem[];
};

type SupabaseClient = Awaited<ReturnType<typeof createClient>>;

type CanonicalAppCode = "shell" | "anima" | "viso" | "nexo" | "fogo" | "origo" | "pulso" | "numera" | "aura" | "pass";
type LocalAppEntity = "default" | Exclude<CanonicalAppCode, "shell" | "pass">;

const APP_ENTITY =
  (process.env.NEXT_PUBLIC_VENTO_ENTITY?.toLowerCase() as LocalAppEntity) ?? "viso";

const APP_CODE: CanonicalAppCode = APP_ENTITY === "default" ? "viso" : APP_ENTITY;

const PRIVILEGED_WORK_CONTEXT_BYPASS_ROLES = new Set([
  "propietario",
  "gerente_general",
]);

const ANIMA_URL = "https://anima.ventogroup.co";

const ICON_NAMES = new Set<IconName>([
  "dashboard",
  "accounting",
  "users",
  "calendar",
  "store",
  "sparkles",
  "package",
  "menu",
  "fileText",
  "briefcase",
  "phone",
]);

const APP_SWITCHER_ITEMS: Omit<AppSwitcherItem, "access">[] = [
  { id: "shell", name: "Vento OS", description: "Launcher del ecosistema.", logoSrc: "/apps/hub.svg", brandColor: "#111827", href: "https://os.ventogroup.co", status: "active", group: "Workspace" },
  { id: "anima", name: "ANIMA", description: "Jornadas y asistencia.", logoSrc: "/apps/anima.svg", brandColor: "#14B8A6", href: "https://anima.ventogroup.co", status: "active", group: "Workspace" },
  { id: "viso", name: "VISO", description: "Gerencia y auditoria.", logoSrc: "/apps/viso.svg", brandColor: "#A855F7", href: "https://viso.ventogroup.co", status: "active", group: "Operacion" },
  { id: "nexo", name: "NEXO", description: "Inventario y logistica.", logoSrc: "/apps/nexo.svg", brandColor: "#F59E0B", href: "https://nexo.ventogroup.co", status: "active", group: "Operacion" },
  { id: "fogo", name: "FOGO", description: "Recetas y produccion.", logoSrc: "/apps/fogo.svg", brandColor: "#FB7185", href: "https://fogo.ventogroup.co", status: "active", group: "Operacion" },
  { id: "origo", name: "ORIGO", description: "Compras y proveedores.", logoSrc: "/apps/origo.svg", brandColor: "#0EA5E9", href: "https://origo.ventogroup.co", status: "active", group: "Operacion" },
  { id: "pulso", name: "PULSO", description: "POS y ventas.", logoSrc: "/apps/pulso.svg", brandColor: "#EF4444", href: "https://pulso.ventogroup.co", status: "active", group: "Operacion" },
  { id: "numera", name: "NUMERA", description: "Economia y rentabilidad.", logoSrc: "/apps/numera.svg", brandColor: "#2563EB", href: "https://numera.ventogroup.co", status: "active", group: "Operacion" },
  { id: "aura", name: "AURA", description: "Identidad canonica diferida.", logoSrc: "/apps/aura.svg", brandColor: "#A855F7", href: "", status: "soon", group: "Proximamente" },
  { id: "pass", name: "Vento Pass", description: "Cliente sin destino web aprobado.", logoSrc: "/apps/pass.svg", brandColor: "#0F766E", href: "", status: "soon", group: "Proximamente" },
];

function asId(value: unknown) {
  return String(value ?? "").trim();
}

function uniqueIds(values: Array<string | null | undefined>) {
  return Array.from(new Set(values.map(asId).filter(Boolean)));
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function readOperationalContextFromDeviceInfo(
  deviceInfo: Record<string, unknown> | null | undefined,
): Partial<ActiveWorkContext> | null {
  const root = asRecord(deviceInfo);
  const context = asRecord(root?.operationalContext);
  if (!context) return null;

  const siteId = asId(context.siteId);
  const areaId = asId(context.areaId);
  const shiftId = asId(context.shiftId);
  const operationalRole = asId(context.operationalRole);

  if (!siteId && !areaId && !shiftId && !operationalRole) return null;

  return {
    siteId,
    areaId,
    shiftId,
    operationalRole,
  };
}

function isOperationalSite(site: SiteRow): boolean {
  return String(site.operational_visibility ?? "operational") === "operational";
}

function normalizeIconName(
  value: string | null | undefined,
): IconName | undefined {
  const icon = String(value ?? "").trim();
  return ICON_NAMES.has(icon as IconName) ? (icon as IconName) : undefined;
}

function splitPermissionCode(permissionCode: string, fallbackAppId: string) {
  const normalized = permissionCode.trim();

  if (!normalized) {
    return {
      appId: fallbackAppId,
      code: "",
    };
  }

  const firstDotIndex = normalized.indexOf(".");

  if (firstDotIndex === -1) {
    return {
      appId: fallbackAppId,
      code: normalized,
    };
  }

  return {
    appId: normalized.slice(0, firstDotIndex),
    code: normalized.slice(firstDotIndex + 1),
  };
}

function isOperationsHref(href: string) {
  return href === "/operations" || href.startsWith("/operations/");
}

function buildOperationsNavItem(row: NavigationRow): NavItem {
  return {
    href: "/operations",
    label: "Operación",
    description: "Contexto operativo, puntos de marcación, roles y perfiles.",
    icon: "briefcase",
    permissionCode: String(row.required_permission_code ?? "").trim(),
  };
}

function buildNavGroups(rows: NavigationRow[]): NavGroup[] {
  const groups = new Map<string, NavItem[]>();
  let operationsNavAdded = false;

  for (const row of rows) {
    const groupLabel = String(row.group_label ?? "").trim();
    const href = String(row.href ?? "").trim();
    const label = String(row.label ?? "").trim();
    const permissionCode = String(row.required_permission_code ?? "").trim();

    if (!groupLabel || !href || !label || !permissionCode) continue;

    const current = groups.get(groupLabel) ?? [];

    if (isOperationsHref(href)) {
      if (!operationsNavAdded) {
        current.push(buildOperationsNavItem(row));
        operationsNavAdded = true;
      }

      groups.set(groupLabel, current);
      continue;
    }

    current.push({
      href,
      label,
      description: row.description ?? undefined,
      icon: normalizeIconName(row.icon),
      permissionCode,
    });

    groups.set(groupLabel, current);
  }

  return Array.from(groups.entries())
    .map(([label, items]) => ({
      label,
      items,
    }))
    .filter((group) => group.items.length > 0);
}

function resolveOperatingGate({
  appCode,
  role,
  activeWorkContext,
  isSharedDevice,
}: {
  appCode: string;
  role: string | null;
  activeWorkContext: ActiveWorkContext | null;
  isSharedDevice: boolean;
}): OperatingGate {
  if (appCode === "anima") {
    return {
      mode: "anima",
      isBlocked: false,
      title: "ANIMA disponible",
      description: "Desde aquí puedes iniciar o cerrar tu jornada.",
      actionHref: ANIMA_URL,
      actionLabel: "Abrir ANIMA",
    };
  }

  if (isSharedDevice) {
    return {
      mode: "shared_device",
      isBlocked: false,
      title: "Dispositivo operativo autorizado",
      description: "Este equipo puede abrir apps permitidas. Cada acción deberá identificar al trabajador con jornada activa.",
      actionHref: ANIMA_URL,
      actionLabel: "Ir a ANIMA",
    };
  }

  if (!role) {
    return {
      mode: "anonymous",
      isBlocked: false,
      title: "",
      description: "",
      actionHref: ANIMA_URL,
      actionLabel: "Ir a ANIMA",
    };
  }

  if (PRIVILEGED_WORK_CONTEXT_BYPASS_ROLES.has(role)) {
    return {
      mode: "privileged_bypass",
      isBlocked: false,
      title: "Acceso administrativo",
      description: "Este rol puede entrar sin jornada activa para administrar o corregir la operación.",
      actionHref: ANIMA_URL,
      actionLabel: "Ir a ANIMA",
    };
  }

  if (activeWorkContext) {
    return {
      mode: "personal_active_work",
      isBlocked: false,
      title: "Jornada activa",
      description: "Contexto operativo aplicado desde ANIMA.",
      actionHref: ANIMA_URL,
      actionLabel: "Abrir ANIMA",
    };
  }

  return {
    mode: "personal_no_work",
    isBlocked: true,
    title: "No tienes jornada activa",
    description: "Para usar Vento OS debes iniciar tu jornada en ANIMA. Si trabajas sin horario fijo, inicia una jornada flexible.",
    actionHref: ANIMA_URL,
    actionLabel: "Ir a ANIMA",
  };
}

function normalizeAppCodes(value: string[] | null | undefined) {
  return Array.from(
    new Set(
      (value ?? [])
        .map((item) => String(item ?? "").trim().toLowerCase())
        .filter(Boolean),
    ),
  );
}

function sharedDeviceAllowsApp(
  sharedDevice: SharedOperationalDeviceRow,
  appCode: string,
) {
  return normalizeAppCodes(sharedDevice.allowed_app_codes).includes(
    appCode.trim().toLowerCase(),
  );
}

function sharedDeviceDefaultHref(sharedDevice: SharedOperationalDeviceRow) {
  const defaultAppCode = String(sharedDevice.default_app_code || APP_CODE)
    .trim()
    .toLowerCase();

  const app = APP_SWITCHER_ITEMS.find((item) => item.id === defaultAppCode);
  return app?.href ?? "https://os.ventogroup.co";
}

async function resolveSharedOperationalDevice({
  supabase,
}: {
  supabase: SupabaseClient;
}): Promise<SharedOperationalDeviceRow | null> {
  const { data, error } = await supabase
    .rpc("current_shared_operational_device_v1")
    .maybeSingle();

  if (error || !data) return null;

  return data as SharedOperationalDeviceRow;
}

function resolveAllowedAppsForSharedDevice(
  sharedDevice: SharedOperationalDeviceRow,
): AppSwitcherItem[] {
  const allowedAppCodes = new Set(normalizeAppCodes(sharedDevice.allowed_app_codes));

  return APP_SWITCHER_ITEMS.map((app): AppSwitcherItem => {
    if (app.id === "shell" || app.id === "anima") {
      return {
        ...app,
        access: "enabled",
      };
    }

    if (app.status === "soon") {
      return {
        ...app,
        access: "soon",
      };
    }

    return {
      ...app,
      access: allowedAppCodes.has(app.id) ? "enabled" : "disabled",
    };
  });
}

async function resolveNavigationItemsForSharedDevice({
  supabase,
  appCode,
  sharedDevice,
}: {
  supabase: SupabaseClient;
  appCode: string;
  sharedDevice: SharedOperationalDeviceRow;
}): Promise<NavGroup[]> {
  if (!sharedDeviceAllowsApp(sharedDevice, appCode)) return [];

  const { data, error } = await supabase
    .from("app_navigation_items")
    .select(
      "group_label,group_order,label,description,href,icon,required_permission_code,sort_order"
    )
    .eq("app_code", appCode)
    .eq("is_active", true)
    .order("group_order", { ascending: true })
    .order("sort_order", { ascending: true });

  if (error || !data) return [];

  const rows = data as NavigationRow[];
  const navigationRole = String(sharedDevice.navigation_role ?? "").trim();
  if (!navigationRole) return [];

  const permissionResults = await Promise.all(
    rows.map(async (row) => {
      const permissionCode = String(row.required_permission_code ?? "").trim();
      if (!permissionCode) return false;

      const { appId, code } = splitPermissionCode(permissionCode, appCode);
      if (!code) return false;

      return checkOperationalRolePermission({
        supabase,
        roleCode: navigationRole,
        appId,
        code,
        siteId: sharedDevice.site_id ?? null,
        areaId: sharedDevice.area_id ?? null,
      });
    })
  );

  return buildNavGroups(rows.filter((_, index) => permissionResults[index]));
}

async function resolveActiveWorkContext({
  supabase,
  userId,
}: {
  supabase: SupabaseClient;
  userId: string;
}): Promise<ActiveWorkContext | null> {
  const { data: lastAttendanceLog } = await supabase
    .from("attendance_logs")
    .select("action,site_id,shift_id,device_info")
    .eq("employee_id", userId)
    .in("action", ["check_in", "check_out"])
    .order("occurred_at", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  const log = lastAttendanceLog as AttendanceLogRow | null;

  if (!log || log.action !== "check_in") return null;

  const deviceContext = readOperationalContextFromDeviceInfo(log.device_info);
  const shiftId = asId(deviceContext?.shiftId || log.shift_id);
  let siteId = asId(deviceContext?.siteId || log.site_id);
  let operationalRole = asId(deviceContext?.operationalRole);

  if (shiftId && (!siteId || !operationalRole)) {
    const { data: shiftRow } = await supabase
      .from("employee_shifts")
      .select("id,site_id,operational_role")
      .eq("id", shiftId)
      .eq("employee_id", userId)
      .maybeSingle();

    const shift = shiftRow as ShiftContextRow | null;

    siteId = siteId || asId(shift?.site_id);
    operationalRole = operationalRole || asId(shift?.operational_role);
  }

  if (!siteId && !operationalRole && !shiftId) return null;

  return {
    siteId,
    areaId: asId(deviceContext?.areaId),
    shiftId,
    operationalRole,
  };
}

async function resolveAllowedApps({
  supabase,
  activeSiteId,
  activeAreaId,
  actualRole,
}: {
  supabase: SupabaseClient;
  activeSiteId: string;
  activeAreaId: string;
  actualRole: string;
}): Promise<AppSwitcherItem[]> {
  const resolved = await Promise.all(
    APP_SWITCHER_ITEMS.map(async (app): Promise<AppSwitcherItem> => {
      if (app.id === "shell") {
        return {
          ...app,
          access: "enabled",
        };
      }

      if (app.status === "soon") {
        return {
          ...app,
          access: "soon",
        };
      }

      const allowed = await checkPermissionWithRoleOverride({
        supabase,
        appId: app.id,
        code: "access",
        context: {
          siteId: activeSiteId || null,
          areaId: activeAreaId || null,
        },
        actualRole,
      });

      return {
        ...app,
        access: allowed ? "enabled" : "disabled",
      };
    }),
  );

  return resolved;
}

async function resolveNavigationItems({
  supabase,
  appCode,
  activeSiteId,
  activeAreaId,
  actualRole,
}: {
  supabase: SupabaseClient;
  appCode: string;
  activeSiteId: string;
  activeAreaId: string;
  actualRole: string;
}): Promise<NavGroup[]> {
  const { data, error } = await supabase
    .from("app_navigation_items")
    .select(
      "group_label,group_order,label,description,href,icon,required_permission_code,sort_order",
    )
    .eq("app_code", appCode)
    .eq("is_active", true)
    .order("group_order", { ascending: true })
    .order("sort_order", { ascending: true });

  if (error || !data) return [];

  const rows = data as NavigationRow[];

  const permissionResults = await Promise.all(
    rows.map(async (row) => {
      const permissionCode = String(row.required_permission_code ?? "").trim();

      if (!permissionCode) return false;

      const { appId, code } = splitPermissionCode(permissionCode, appCode);

      if (!code) return false;

      return checkPermissionWithRoleOverride({
        supabase,
        appId,
        code,
        context: {
          siteId: activeSiteId || null,
          areaId: activeAreaId || null,
        },
        actualRole,
      });
    }),
  );

  const allowedRows = rows.filter((_, index) => permissionResults[index]);

  return buildNavGroups(allowedRows);
}

export async function VentoShell({ children }: { children: React.ReactNode }) {
  const supabase = await createClient();
  const { data: userRes } = await supabase.auth.getUser();
  const user = userRes.user ?? null;

  let displayName = "Usuario";
  let role: string | null = null;
  let sites: SiteRow[] = [];
  let activeSiteId = "";
  let activeAreaId = "";
  let effectiveRole: string | null = null;
  let activeWorkContext: ActiveWorkContext | null = null;
  let activeContextLabel: string | null = null;
  let activeContextDescription: string | null = null;
  let operatingGate: OperatingGate | null = null;
  let appSwitcherItems: AppSwitcherItem[] = [];
  let navGroups: NavGroup[] = [];

  if (user) {
    const sharedDevice = await resolveSharedOperationalDevice({ supabase });

    if (sharedDevice) {
      const currentAppAllowed = sharedDeviceAllowsApp(sharedDevice, APP_CODE);

      displayName =
        sharedDevice.label ||
        sharedDevice.code ||
        user.email ||
        "Dispositivo compartido";
      role = "dispositivo_compartido";
      activeSiteId = asId(sharedDevice.site_id);
      activeAreaId = asId(sharedDevice.area_id);

      operatingGate = currentAppAllowed
        ? resolveOperatingGate({
            appCode: APP_CODE,
            role: null,
            activeWorkContext: null,
            isSharedDevice: true,
          })
        : {
            mode: "shared_device",
            isBlocked: true,
            title: "App no habilitada para este dispositivo",
            description: `Este dispositivo solo puede abrir las apps asignadas. App principal: ${sharedDevice.default_app_code.toUpperCase()}.`,
            actionHref: sharedDeviceDefaultHref(sharedDevice),
            actionLabel: "Abrir app principal",
          };

      activeContextLabel = "Dispositivo compartido";
      activeContextDescription = currentAppAllowed
        ? `${sharedDevice.label} · Cada acción sensible requiere trabajador con jornada activa.`
        : operatingGate.description;

      if (activeSiteId) {
        const { data: siteRows } = await supabase
          .from("sites")
          .select("id,name,site_type,operational_visibility")
          .eq("id", activeSiteId)
          .limit(1);

        sites = ((siteRows ?? []) as SiteRow[]).filter(isOperationalSite);
      }

      const [resolvedApps, resolvedNavGroups] = await Promise.all([
        Promise.resolve(resolveAllowedAppsForSharedDevice(sharedDevice)),
        operatingGate.isBlocked
          ? Promise.resolve([])
          : resolveNavigationItemsForSharedDevice({
              supabase,
              appCode: APP_CODE,
              sharedDevice,
            }),
      ]);

      appSwitcherItems = resolvedApps;
      navGroups = resolvedNavGroups;
    } else {
      const { data: employeeRow } = await supabase
        .from("employees")
        .select("role,full_name,alias,site_id")
        .eq("id", user.id)
        .maybeSingle();

      role = employeeRow?.role ?? null;
      displayName =
        employeeRow?.alias ?? employeeRow?.full_name ?? user.email ?? "Usuario";

      const [
        { data: employeeSites },
        { data: employeeSettings },
        resolvedActiveWorkContext,
      ] = await Promise.all([
        supabase
          .from("employee_sites")
          .select("site_id,is_primary")
          .eq("employee_id", user.id)
          .eq("is_active", true)
          .order("is_primary", { ascending: false })
          .limit(50),
        supabase
          .from("employee_settings")
          .select("selected_site_id")
          .eq("employee_id", user.id)
          .maybeSingle(),
        resolveActiveWorkContext({ supabase, userId: user.id }),
      ]);

      activeWorkContext = resolvedActiveWorkContext;

      const employeeSiteRows = (employeeSites ?? []) as EmployeeSiteRow[];


      const assignedSiteIds = uniqueIds([
        activeWorkContext?.siteId ?? null,
        ...employeeSiteRows.map((row) => row.site_id),
        employeeRow?.site_id ?? null,
      ]);

      const cookieStore = await cookies();
      const siteOverrideId = asId(cookieStore.get("viso_site_override_id")?.value);

      const preferredSiteId = asId(
        activeWorkContext?.siteId ||
          siteOverrideId ||
          employeeSettings?.selected_site_id ||
          employeeSiteRows[0]?.site_id ||
          employeeRow?.site_id ||
          "",
      );

      activeSiteId =
        preferredSiteId && assignedSiteIds.includes(preferredSiteId)
          ? preferredSiteId
          : (assignedSiteIds[0] ?? "");

      activeAreaId = asId(activeWorkContext?.areaId);
      effectiveRole = asId(activeWorkContext?.operationalRole) || role;

      operatingGate = resolveOperatingGate({
        appCode: APP_CODE,
        role,
        activeWorkContext,
        isSharedDevice: false,
      });

      if (activeWorkContext) {
        activeContextLabel = "Jornada activa";
        activeContextDescription = "Contexto operativo aplicado desde ANIMA";
      } else if (operatingGate.mode === "privileged_bypass") {
        activeContextLabel = "Acceso administrativo";
        activeContextDescription = operatingGate.description;
      } else if (operatingGate.isBlocked) {
        activeContextLabel = "Sin jornada activa";
        activeContextDescription = operatingGate.description;
      }

      if (assignedSiteIds.length) {
        const { data: siteRows } = await supabase
          .from("sites")
          .select("id,name,site_type,operational_visibility")
          .in("id", assignedSiteIds)
          .order("name", { ascending: true });

        sites = ((siteRows ?? []) as SiteRow[]).filter(isOperationalSite);

        if (activeSiteId && !sites.some((site) => site.id === activeSiteId)) {
          activeSiteId = sites[0]?.id ?? "";
        }
      }

      if (activeAreaId) {
        const { data: activeArea } = await supabase
          .from("areas")
          .select("site_id")
          .eq("id", activeAreaId)
          .maybeSingle();

        if (String(activeArea?.site_id ?? "") !== activeSiteId) {
          activeAreaId = "";
        }
      }

      if (effectiveRole) {
        const [resolvedApps, resolvedNavGroups] = await Promise.all([
          resolveAllowedApps({
                supabase,
                activeSiteId,
                activeAreaId,
                actualRole: effectiveRole,
              }),
          operatingGate?.isBlocked
            ? Promise.resolve([])
            : resolveNavigationItems({
                  supabase,
                  appCode: APP_CODE,
                  activeSiteId,
                  activeAreaId,
                  actualRole: effectiveRole,
                }),
        ]);

        appSwitcherItems = operatingGate?.isBlocked
          ? resolvedApps.map((app) =>
              app.id === "shell" || app.id === "anima"
                ? { ...app, access: app.status === "soon" ? "soon" : "enabled" }
                : { ...app, access: app.status === "soon" ? "soon" : "disabled" }
            )
          : resolvedApps;

        navGroups = resolvedNavGroups;
      }
    }
  }

  return (
    <VentoChrome
      displayName={displayName}
      role={role ?? undefined}
      email={user?.email ?? null}
      sites={sites}
      activeSiteId={activeSiteId}
      activeContextLabel={activeContextLabel}
      activeContextDescription={activeContextDescription}
      operatingGate={operatingGate}
      appSwitcherItems={appSwitcherItems}
      navGroups={navGroups}
    >
      {children}
    </VentoChrome>
  );
}
