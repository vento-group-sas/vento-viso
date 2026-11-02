import Link from "next/link";
import Script from "next/script";

import { MonthlyShiftBuilder } from "@/components/viso/monthly-shift-builder";
import { PageHeader } from "@/components/vento/standard/page-header";
import { createAdminClient } from "@/lib/supabase/admin";

import {
  addDays,
  cleanOptionalText,
  endOfMonth,
  formatShiftRange,
  getAreaVisualFromRole,
  getEmployeeRef,
  getOperationalRoleCandidateFromBaseRole,
  getShiftMinutes,
  isOperationalSite,
  isoDate,
  requireStaffScheduleAccess,
  safeDecode,
  startOfMonth,
  type EmployeeOperationalProfileRow,
  type EmployeeRow,
  type EmployeeSiteLink,
  type ShiftRow,
  type SiteOperationalRoleRow,
  type SiteRow,
} from "../helpers";
import {
  deleteMonthlyDraftShiftAction,
  deleteMonthlyDraftsAction,
  publishMonthAction,
} from "./actions";
import {
  MONTHLY_SCHEDULE_REFERENCE_MINUTES,
  MONTHLY_SCHEDULE_WARNING_MINUTES,
} from "./constants";
import { projectMonthlyPotentialOvertime } from "./overtime-projection";

export const dynamic = "force-dynamic";


function parseMonth(input?: string) {
  const match = /^(\d{4})-(\d{2})$/.exec(input ?? "");
  if (match) {
    const year = Number(match[1]);
    const monthIndex = Number(match[2]) - 1;
    if (monthIndex >= 0 && monthIndex <= 11) {
      return new Date(year, monthIndex, 1, 12, 0, 0, 0);
    }
  }
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), 1, 12, 0, 0, 0);
}

function monthKey(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

function buildMonthHref(
  siteId: string,
  month: string,
  params: Record<string, string | null | undefined> = {},
) {
  const query = new URLSearchParams();
  if (siteId) query.set("site_id", siteId);
  query.set("month", month);
  for (const [key, value] of Object.entries(params)) {
    if (value) query.set(key, value);
  }
  return `/staff/schedule/month?${query.toString()}`;
}

function formatHours(minutes: number) {
  const hours = Math.max(0, minutes) / 60;
  return `${hours.toFixed(Number.isInteger(hours) ? 0 : 1).replace(".", ",")} h`;
}

function getMonthStatus(totalMinutes: number) {
  if (totalMinutes > MONTHLY_SCHEDULE_REFERENCE_MINUTES) {
    return {
      label: `Sobre referencia ${formatHours(totalMinutes - MONTHLY_SCHEDULE_REFERENCE_MINUTES)} (revisar)`,
      totalClass: "border-amber-300 bg-amber-50 text-amber-900",
      barClass: "bg-amber-500",
      rowClass: "bg-amber-50/45",
      shiftClass: "ring-1 ring-amber-300",
    };
  }
  if (totalMinutes >= MONTHLY_SCHEDULE_WARNING_MINUTES) {
    return {
      label: "Cerca de la referencia",
      totalClass: "border-amber-300 bg-amber-50 text-amber-800",
      barClass: "bg-amber-500",
      rowClass: "bg-amber-50/30",
      shiftClass: "ring-1 ring-amber-300",
    };
  }
  return {
    label: "Bajo la referencia mensual",
    totalClass: "border-emerald-200 bg-emerald-50 text-emerald-800",
    barClass: "bg-emerald-500",
    rowClass: "",
    shiftClass: "",
  };
}

export default async function StaffScheduleMonthPage({
  searchParams,
}: {
  searchParams?: Promise<{
    site_id?: string;
    month?: string;
    open?: string;
    employee_id?: string;
    date?: string;
    ok?: string;
    warning?: string;
    error?: string;
  }>;
}) {
  const sp = (await searchParams) ?? {};
  const selectedMonth = parseMonth(sp.month);
  const selectedMonthKey = monthKey(selectedMonth);
  const monthStart = startOfMonth(selectedMonth);
  const monthEnd = endOfMonth(selectedMonth);
  const monthStartIso = isoDate(monthStart);
  const monthEndIso = isoDate(monthEnd);
  // La semana de trabajo completa puede empezar/terminar fuera de este mes.
  const firstFullWeekDay = addDays(monthStart, -((monthStart.getDay() + 6) % 7));
  const lastFullWeekDay = addDays(monthEnd, (7 - monthEnd.getDay()) % 7);
  const monthDays = Array.from({ length: monthEnd.getDate() }, (_, index) => {
    const date = addDays(monthStart, index);
    return {
      iso: isoDate(date),
      dayNumber: date.getDate(),
      weekday: date.toLocaleDateString("es-CO", { weekday: "short" }),
      isSunday: date.getDay() === 0,
      isWeekend: date.getDay() === 0 || date.getDay() === 6,
    };
  });

  await requireStaffScheduleAccess(
    "/staff/schedule/month",
    sp.site_id ?? null,
  );
  const supabase = createAdminClient();

  const { data: sitesData } = await supabase
    .from("sites")
    .select(
      "id,name,code,site_type,type,operational_visibility,site_operational_capabilities(can_schedule_staff)",
    )
    .order("name", { ascending: true });

  const sites = (sitesData ?? []) as SiteRow[];
  const operationalSites = sites.filter(isOperationalSite);
  const selectedSiteId =
    sp.site_id && operationalSites.some((site) => site.id === sp.site_id)
      ? sp.site_id
      : (operationalSites[0]?.id ?? "");
  const selectedSite =
    operationalSites.find((site) => site.id === selectedSiteId) ?? null;

  const [directEmployeesRes, linkedEmployeesRes, shiftsRes, matrixRes, profilesRes] =
    await Promise.all([
      selectedSiteId
        ? supabase
            .from("employees")
            .select("id,full_name,alias,role,is_active,site_id")
            .eq("site_id", selectedSiteId)
            .eq("is_active", true)
            .order("full_name", { ascending: true })
        : Promise.resolve({ data: [], error: null }),
      selectedSiteId
        ? supabase
            .from("employee_sites")
            .select(
              "employee_id,is_active,employee:employees(id,full_name,alias,role,is_active,site_id)",
            )
            .eq("site_id", selectedSiteId)
            .eq("is_active", true)
        : Promise.resolve({ data: [], error: null }),
      selectedSiteId
        ? supabase
            .from("employee_shifts")
            .select(
              "id,employee_id,shift_date,start_time,end_time,shift_kind,operational_role,show_end_as_close,break_minutes,status,notes,site_id,area_id,checkin_site_id,checkout_site_id,published_at",
            )
            .eq("site_id", selectedSiteId)
            .gte("shift_date", monthStartIso)
            .lte("shift_date", monthEndIso)
            .order("shift_date", { ascending: true })
            .order("start_time", { ascending: true })
        : Promise.resolve({ data: [], error: null }),
      selectedSiteId
        ? supabase
            .from("vento_site_operational_role_matrix_v1")
            .select(
              "site_id,area_id,area_name,area_kind,role_code,role_label,role_family,is_default,requires_external_checkin,requires_external_checkout,is_active",
            )
            .eq("site_id", selectedSiteId)
            .eq("is_active", true)
            .order("area_name", { ascending: true })
            .order("role_label", { ascending: true })
        : Promise.resolve({ data: [], error: null }),
      selectedSiteId
        ? supabase
            .from("employee_site_operational_profiles")
            .select(
              "employee_id,site_id,default_operational_role,default_checkin_site_id,default_checkout_site_id,is_active",
            )
            .eq("site_id", selectedSiteId)
            .neq("is_active", false)
        : Promise.resolve({ data: [], error: null }),
    ]);

  const employeeMap = new Map<string, EmployeeRow>();
  for (const employee of (directEmployeesRes.data ?? []) as EmployeeRow[]) {
    employeeMap.set(employee.id, employee);
  }
  for (const link of (linkedEmployeesRes.data ?? []) as EmployeeSiteLink[]) {
    const employee = getEmployeeRef(link.employee);
    if (employee?.id && employee.is_active) employeeMap.set(employee.id, employee);
  }
  const employees = [...employeeMap.values()].sort((a, b) =>
    (a.full_name ?? a.alias ?? a.id).localeCompare(
      b.full_name ?? b.alias ?? b.id,
      "es",
    ),
  );

  const shifts = (shiftsRes.data ?? []) as ShiftRow[];
  const shiftsByEmployeeDay = new Map<string, ShiftRow[]>();
  for (const shift of shifts) {
    const key = `${shift.employee_id}__${shift.shift_date}`;
    const dayRows = shiftsByEmployeeDay.get(key) ?? [];
    dayRows.push(shift);
    shiftsByEmployeeDay.set(key, dayRows);
  }

  const employeeIds = employees.map((employee) => employee.id);
  const allSiteMonthResult =
    employeeIds.length > 0
      ? await supabase
          .from("employee_shifts")
          .select(
            "id,employee_id,shift_date,start_time,end_time,shift_kind,operational_role,show_end_as_close,break_minutes,status,notes,site_id,area_id,checkin_site_id,checkout_site_id,published_at",
          )
          .in("employee_id", employeeIds)
          .gte("shift_date", isoDate(firstFullWeekDay))
          .lte("shift_date", isoDate(lastFullWeekDay))
      : { data: [], error: null };
  const allSiteMonthShiftsData = allSiteMonthResult.data ?? [];
  const allSiteMonthShiftsError = allSiteMonthResult.error;
  const projectedOvertimeByEmployee = projectMonthlyPotentialOvertime(
    allSiteMonthShiftsData as ShiftRow[],
    monthStartIso,
    monthEndIso,
    getShiftMinutes,
  );

  const totalsByEmployee = new Map<
    string,
    { total: number; published: number; draft: number }
  >();
  for (const employee of employees) {
    totalsByEmployee.set(employee.id, { total: 0, published: 0, draft: 0 });
  }
  for (const shift of (allSiteMonthShiftsData ?? []) as ShiftRow[]) {
    if (shift.status === "cancelled") continue;
    if (shift.shift_date < monthStartIso || shift.shift_date > monthEndIso) continue;
    const minutes = getShiftMinutes(shift);
    const totals = totalsByEmployee.get(shift.employee_id) ?? {
      total: 0,
      published: 0,
      draft: 0,
    };
    totals.total += minutes;
    if (shift.published_at) totals.published += minutes;
    else totals.draft += minutes;
    totalsByEmployee.set(shift.employee_id, totals);
  }
  for (const dayRows of shiftsByEmployeeDay.values()) {
    dayRows.sort((a, b) => a.start_time.localeCompare(b.start_time, "es"));
  }

  const matrixRows = (matrixRes.data ?? []) as Array<
    SiteOperationalRoleRow & { is_active?: boolean | null }
  >;
  const roleOptions = matrixRows.map((row) => ({
    value: `${row.role_code}||${row.area_id ?? ""}`,
    roleCode: row.role_code,
    areaId: row.area_id ?? "",
    label: `${row.role_label ?? row.role_code} · ${row.area_name ?? "General"}`,
    isDefault: Boolean(row.is_default),
  }));
  const profiles = (profilesRes.data ?? []) as EmployeeOperationalProfileRow[];
  const profileByEmployee = new Map(
    profiles.map((profile) => [profile.employee_id, profile]),
  );

  const getDefaultRoleContext = (employee: EmployeeRow) => {
    const profileRole = cleanOptionalText(
      profileByEmployee.get(employee.id)?.default_operational_role,
    );
    const baseCandidate = getOperationalRoleCandidateFromBaseRole(employee.role);
    const candidate = profileRole ?? cleanOptionalText(baseCandidate);
    const matching = roleOptions.filter((option) => option.roleCode === candidate);
    const directOption =
      matching.find((option) => option.isDefault) ??
      (matching.length === 1 ? matching[0] : null);
    if (directOption) return directOption.value;
    return roleOptions.length === 1 ? roleOptions[0]?.value ?? "" : "";
  };

  const requestedEmployeeId = safeDecode(sp.employee_id);
  const requestedDate = safeDecode(sp.date);
  const formOpen =
    sp.open === "1" ||
    employees.some((employee) => employee.id === requestedEmployeeId);
  const defaultEmployeeId = employees.some(
    (employee) => employee.id === requestedEmployeeId,
  )
    ? requestedEmployeeId
    : (employees[0]?.id ?? "");
  const defaultDate = monthDays.some((day) => day.iso === requestedDate)
    ? requestedDate
    : "";
  const closeFormHref = buildMonthHref(selectedSiteId, selectedMonthKey);
  const returnTo = closeFormHref;
  const previousMonth = new Date(
    selectedMonth.getFullYear(),
    selectedMonth.getMonth() - 1,
    1,
    12,
  );
  const nextMonth = new Date(
    selectedMonth.getFullYear(),
    selectedMonth.getMonth() + 1,
    1,
    12,
  );
  const currentMonth = new Date();
  const monthLabel = selectedMonth.toLocaleDateString("es-CO", {
    month: "long",
    year: "numeric",
  });
  const draftCount = shifts.filter((shift) => !shift.published_at).length;
  const employeesAboveReference = employees.filter(
    (employee) =>
      (totalsByEmployee.get(employee.id)?.total ?? 0) >
      MONTHLY_SCHEDULE_REFERENCE_MINUTES,
  );

  return (
    <div className="space-y-6">
      <PageHeader
        title="Horario mensual"
        subtitle="Programa los turnos del mes. Referencia salarial 2026: 210 h; no es un tope de publicación ni la liquidación de horas extra."
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <Link href="/staff" className="ui-btn ui-btn--ghost">
              Ver trabajadores
            </Link>
            <Link href="/staff/schedule/metrics" className="ui-btn ui-btn--ghost">
              Métricas
            </Link>
            <Link
              href={buildMonthHref(selectedSiteId, selectedMonthKey, { open: "1" })}
              className="ui-btn ui-btn--brand"
            >
              Crear turnos del mes
            </Link>
          </div>
        }
      />

      {safeDecode(sp.error) ? (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
          {safeDecode(sp.error)}
        </div>
      ) : null}
      {safeDecode(sp.warning) ? (
        <div className="rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm font-medium text-amber-900">
          {safeDecode(sp.warning)}
        </div>
      ) : null}
      {safeDecode(sp.ok) ? (
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-800">
          {safeDecode(sp.ok)}
        </div>
      ) : null}

      {allSiteMonthShiftsError ? (
        <div className="rounded-xl border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-900">
          No se pudieron calcular las horas del empleado en todas las sedes: {allSiteMonthShiftsError.message}. La publicación mensual queda deshabilitada hasta corregir la consulta.
        </div>
      ) : null}

      {employeesAboveReference.length > 0 ? (
        <div className="rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          <div className="font-semibold">Horas sobre la referencia mensual: requieren revisión, no bloquean por sí solas</div>
          <div className="mt-1">
            {employeesAboveReference
              .map((employee) => {
                const minutes = totalsByEmployee.get(employee.id)?.total ?? 0;
                return `${employee.full_name ?? employee.alias ?? employee.id}: ${formatHours(minutes)} (+${formatHours(minutes - MONTHLY_SCHEDULE_REFERENCE_MINUTES)})`;
              })
              .join(" · ")}
          </div>
          <p className="mt-2 text-xs">
            El valor de 210 h es referencia salarial, no clasificación automática de horas extras.
            Verifica la jornada pactada y los límites diarios y semanales antes de autorizar la publicación.
          </p>
        </div>
      ) : null>

      <div className="ui-panel space-y-4">
        <div className="grid gap-4 xl:grid-cols-[minmax(260px,1fr)_minmax(280px,380px)]">
          <div>
            <div className="ui-caption">Sede actual</div>
            <div className="mt-1 text-lg font-semibold text-[var(--ui-text)]">
              {selectedSite?.name ?? selectedSite?.code ?? "Sin sede"}
            </div>
            <p className="mt-1 text-sm text-[var(--ui-muted)]">
              Los turnos nuevos quedan en borrador. Una cifra mensual no sustituye los controles de jornada ordinaria pactada, descansos y horas extra.
            </p>
          </div>

          <form method="get" className="space-y-2">
            <label className="ui-label">Cambiar sede</label>
            <div className="flex gap-2">
              <select name="site_id" className="ui-input" defaultValue={selectedSiteId}>
                {operationalSites.map((site) => (
                  <option key={site.id} value={site.id}>
                    {site.name ?? site.code ?? site.id}
                  </option>
                ))}
              </select>
              <input type="hidden" name="month" value={selectedMonthKey} />
              <button type="submit" className="ui-btn ui-btn--ghost">
                Ir
              </button>
            </div>
          </form>

          <div className="flex flex-wrap items-center gap-2 xl:col-span-2">
            <div className="flex items-center rounded-xl border border-[var(--ui-border)] bg-[var(--ui-surface)] p-1">
              <Link
                href={buildMonthHref(selectedSiteId, monthKey(previousMonth))}
                className="inline-flex h-9 w-9 items-center justify-center rounded-lg text-lg font-semibold text-[var(--ui-muted)] transition hover:bg-[var(--ui-surface-2)]"
                aria-label="Mes anterior"
              >
                ‹
              </Link>
              <div className="min-w-[210px] px-3 text-center text-sm font-semibold capitalize text-[var(--ui-text)]">
                {monthLabel}
              </div>
              <Link
                href={buildMonthHref(selectedSiteId, monthKey(nextMonth))}
                className="inline-flex h-9 w-9 items-center justify-center rounded-lg text-lg font-semibold text-[var(--ui-muted)] transition hover:bg-[var(--ui-surface-2)]"
                aria-label="Mes siguiente"
              >
                ›
              </Link>
            </div>
            <Link
              href={buildMonthHref(selectedSiteId, monthKey(currentMonth))}
              className="ui-btn ui-btn--ghost"
            >
              Mes actual
            </Link>

            <div className="ml-auto flex flex-wrap items-center gap-2">
              {draftCount > 0 ? (
                <form
                  action={deleteMonthlyDraftsAction}
                  data-confirm-message="Se eliminarán todos los borradores del mes. Los turnos publicados se conservarán. ¿Continuar?"
                >
                  <input type="hidden" name="site_id" value={selectedSiteId} />
                  <input type="hidden" name="month" value={selectedMonthKey} />
                  <input type="hidden" name="return_to" value={returnTo} />
                  <button
                    type="submit"
                    className="ui-btn ui-btn--ghost text-[var(--ui-danger)]"
                  >
                    Eliminar borradores ({draftCount})
                  </button>
                </form>
              ) : null}
              <form action={publishMonthAction}>
                <input type="hidden" name="site_id" value={selectedSiteId} />
                <input type="hidden" name="month" value={selectedMonthKey} />
                <input type="hidden" name="return_to" value={returnTo} />
                <label className="mb-3 flex items-start gap-2 text-xs text-[var(--ui-muted)]">
                  <input type="checkbox" name="hours_reviewed" value="yes" required className="mt-0.5" />
                  <span>Confirmo que revisé la jornada pactada, los descansos y la autorización de horas extra de los trabajadores incluidos. Este horario no liquida horas trabajadas.</span>
                </label>
                <button
                  type="submit"
                  className="ui-btn ui-btn--brand"
                  disabled={draftCount === 0 || Boolean(allSiteMonthShiftsError)}
                >
                  Publicar mes
                </button>
              </form>
            </div>
          </div>
        </div>
      </div>

      {formOpen ? (
        <MonthlyShiftBuilder
          siteId={selectedSiteId}
          month={selectedMonthKey}
          returnTo={returnTo}
          closeHref={closeFormHref}
          employees={employees.map((employee) => ({
            id: employee.id,
            label: employee.full_name ?? employee.alias ?? employee.id,
            currentMinutes: totalsByEmployee.get(employee.id)?.total ?? 0,
            defaultRoleContext: getDefaultRoleContext(employee),
          }))}
          roleOptions={roleOptions.map((option) => ({
            value: option.value,
            label: option.label,
          }))}
          days={monthDays.map((day) => ({
            iso: day.iso,
            dayNumber: day.dayNumber,
            weekday: day.weekday,
            isWeekend: day.isWeekend,
          }))}
          defaultEmployeeId={defaultEmployeeId}
          defaultDate={defaultDate}
          referenceMinutes={MONTHLY_SCHEDULE_REFERENCE_MINUTES}
          warningMinutes={MONTHLY_SCHEDULE_WARNING_MINUTES}
        />
      ) : null}

      {!selectedSiteId ? (
        <div className="ui-panel">
          <div className="ui-empty">No hay sedes disponibles para planificar.</div>
        </div>
      ) : employees.length === 0 ? (
        <div className="ui-panel">
          <div className="ui-empty">No hay trabajadores activos en esta sede.</div>
        </div>
      ) : (
        <div className="ui-panel p-0 overflow-hidden">
          <style>{`
            [data-month-table] {
              min-width: ${390 + monthDays.length * 112}px;
              border-collapse: separate;
              border-spacing: 0;
            }
            [data-month-table] [data-sticky-worker] {
              position: sticky;
              left: 0;
              z-index: 15;
              background: var(--ui-surface);
              box-shadow: 1px 0 0 var(--ui-border);
            }
            [data-month-table] [data-sticky-total] {
              position: sticky;
              right: 0;
              z-index: 15;
              background: var(--ui-surface);
              box-shadow: -1px 0 0 var(--ui-border);
            }
            [data-month-table] thead [data-sticky-worker],
            [data-month-table] thead [data-sticky-total] {
              z-index: 25;
              background: var(--ui-surface-2);
            }
          `}</style>
          <div className="overflow-auto ui-scrollbar-subtle">
            <table className="text-xs" data-month-table>
              <thead className="bg-[var(--ui-surface-2)] text-[var(--ui-muted)]">
                <tr>
                  <th
                    className="min-w-[220px] border-b border-r border-[var(--ui-border)] px-3 py-3 text-left"
                    data-sticky-worker
                  >
                    Trabajador
                  </th>
                  {monthDays.map((day) => (
                    <th
                      key={day.iso}
                      className={`w-28 min-w-28 border-b border-r border-[var(--ui-border)] px-2 py-2 text-center ${day.isSunday ? "bg-red-50 text-red-700" : day.isWeekend ? "bg-amber-50" : ""}`}
                    >
                      <div className="text-sm font-bold text-[var(--ui-text)]">
                        {day.dayNumber}
                      </div>
                      <div className="mt-0.5 uppercase">{day.weekday}</div>
                    </th>
                  ))}
                  <th
                    className="min-w-[170px] border-b border-[var(--ui-border)] px-3 py-3 text-left"
                    data-sticky-total
                  >
                    Horas del mes
                  </th>
                </tr>
              </thead>
              <tbody>
                {employees.map((employee) => {
                  const totals = totalsByEmployee.get(employee.id) ?? {
                    total: 0,
                    published: 0,
                    draft: 0,
                  };
                  const status = getMonthStatus(totals.total);
                  const areaVisual = getAreaVisualFromRole(employee.role);
                  const progress = Math.min(
                    100,
                    Math.round(
                      (totals.total / MONTHLY_SCHEDULE_REFERENCE_MINUTES) * 100,
                    ),
                  );
                  const employeeName =
                    employee.full_name ?? employee.alias ?? employee.id;

                  return (
                    <tr key={employee.id} className={status.rowClass}>
                      <td
                        className="border-b border-r border-[var(--ui-border)] px-3 py-3 align-top"
                        data-sticky-worker
                      >
                        <div className="font-semibold text-[var(--ui-text)]">
                          {employeeName}
                        </div>
                        <div className="mt-1 flex flex-wrap items-center gap-1">
                          <span className={`rounded-full border px-2 py-0.5 text-[10px] font-semibold ${areaVisual.chipClass}`}>
                            {areaVisual.label}
                          </span>
                          <span className="text-[10px] text-[var(--ui-muted)]">
                            {employee.role ?? "Sin rol"}
                          </span>
                        </div>
                      </td>

                      {monthDays.map((day) => {
                        const dayRows =
                          shiftsByEmployeeDay.get(`${employee.id}__${day.iso}`) ?? [];
                        return (
                          <td
                            key={`${employee.id}-${day.iso}`}
                            className={`border-b border-r border-[var(--ui-border)] px-1.5 py-2 align-top ${day.isSunday ? "bg-red-50/40" : day.isWeekend ? "bg-amber-50/35" : ""}`}
                          >
                            <div className="flex min-h-12 flex-col gap-1">
                              {dayRows.map((shift) => (
                                <details
                                  key={shift.id}
                                  className="relative"
                                  data-month-shift-menu
                                >
                                  <summary
                                    className={`cursor-pointer list-none rounded-lg border px-2 py-1.5 leading-tight ${shift.published_at ? "border-emerald-200 bg-emerald-50" : "border-amber-200 bg-amber-50"} ${status.shiftClass}`}
                                    title={`${formatShiftRange(shift.start_time, shift.end_time, shift.show_end_as_close, shift.shift_kind)}${shift.notes ? ` · ${shift.notes}` : ""}`}
                                  >
                                    <div className="font-semibold text-[var(--ui-text)]">
                                      {formatShiftRange(
                                        shift.start_time,
                                        shift.end_time,
                                        shift.show_end_as_close,
                                        shift.shift_kind,
                                      )}
                                    </div>
                                    <div className="mt-0.5 text-[9px] uppercase text-[var(--ui-muted)]">
                                      {shift.published_at ? "Publicado" : "Borrador"}
                                    </div>
                                  </summary>
                                  <div className="absolute left-0 top-full z-40 mt-1 min-w-36 rounded-xl border border-[var(--ui-border)] bg-[var(--ui-surface)] p-1 text-sm shadow-xl">
                                    <Link
                                      href={buildMonthHref(selectedSiteId, selectedMonthKey, {
                                        open: "1",
                                        employee_id: employee.id,
                                        date: day.iso,
                                      })}
                                      className="block rounded-lg px-3 py-2 font-medium text-[var(--ui-text)] no-underline hover:bg-[var(--ui-surface-2)]"
                                    >
                                      Nuevo bloque
                                    </Link>
                                    {!shift.published_at ? (
                                      <form
                                        action={deleteMonthlyDraftShiftAction}
                                        data-confirm-message="Se eliminará este borrador. ¿Continuar?"
                                      >
                                        <input type="hidden" name="shift_id" value={shift.id} />
                                        <input type="hidden" name="site_id" value={selectedSiteId} />
                                        <input type="hidden" name="month" value={selectedMonthKey} />
                                        <input type="hidden" name="return_to" value={returnTo} />
                                        <button
                                          type="submit"
                                          className="block w-full rounded-lg px-3 py-2 text-left font-medium text-[var(--ui-danger)] hover:bg-[var(--ui-surface-2)]"
                                        >
                                          Eliminar borrador
                                        </button>
                                      </form>
                                    ) : (
                                      <div className="px-3 py-2 text-xs text-[var(--ui-muted)]">
                                        Los publicados se corrigen desde la vista semanal.
                                      </div>
                                    )}
                                  </div>
                                </details>
                              ))}

                              <Link
                                href={buildMonthHref(selectedSiteId, selectedMonthKey, {
                                  open: "1",
                                  employee_id: employee.id,
                                  date: day.iso,
                                })}
                                className="mt-auto flex min-h-7 items-center justify-center rounded-lg border border-dashed border-transparent text-base font-semibold text-[var(--ui-muted)] no-underline transition hover:border-[var(--ui-border)] hover:bg-[var(--ui-surface-2)] hover:text-[var(--ui-text)]"
                                title={`Crear turno para ${employeeName} el ${day.dayNumber}`}
                              >
                                +
                              </Link>
                            </div>
                          </td>
                        );
                      })}

                      <td
                        className="border-b border-[var(--ui-border)] px-3 py-3 align-top"
                        data-sticky-total
                      >
                        <div className={`rounded-xl border p-2.5 ${status.totalClass}`}>
                          <div className="flex items-baseline justify-between gap-2">
                            <span className="text-base font-bold">
                              {formatHours(totals.total)}
                            </span>
                            <span className="text-[10px] font-semibold">ref. 210 h</span>
                          </div>
                          <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-white/80">
                            <div
                              className={`h-full rounded-full ${status.barClass}`}
                              style={{ width: `${progress}%` }}
                            />
                          </div>
                          <div className="mt-2 text-[10px] font-semibold">
                            {status.label}
                          </div>
                          <div className="mt-1 text-[10px]">
                            Hasta referencia salarial: {formatHours(Math.min(totals.total, MONTHLY_SCHEDULE_REFERENCE_MINUTES))}
                            {" · "}Sobre referencia: {formatHours(Math.max(0, totals.total - MONTHLY_SCHEDULE_REFERENCE_MINUTES))}
                          </div>
                          <div className="mt-1 text-[10px] font-semibold">
                            Ordinarias de referencia semanal: {formatHours(projectedOvertimeByEmployee.get(employee.id)?.ordinaryReferenceMinutes ?? 0)}
                            {" · "}Posibles extras: {formatHours(projectedOvertimeByEmployee.get(employee.id)?.possibleExtraMinutes ?? 0)}
                          </div>
                          <p className="mt-1 text-[9px] opacity-75">
                            Proyección sobre 42 h/semana de todas las sedes. La jornada pactada y los excesos diarios pueden cambiar el resultado; no es liquidación.
                          </p>
                          <div className="mt-1 text-[9px] opacity-75">
                            Todas las sedes · Pub. {formatHours(totals.published)} · Borr. {formatHours(totals.draft)}
                          </div>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <Script id="viso-monthly-schedule-controls" strategy="afterInteractive">
        {`
          (function () {
            if (window.__visoMonthlyScheduleControlsReady) return;
            window.__visoMonthlyScheduleControlsReady = true;

            document.addEventListener("toggle", function (event) {
              var menu = event.target;
              if (!menu || !menu.matches || !menu.matches("[data-month-shift-menu]") || !menu.open) return;
              document.querySelectorAll("[data-month-shift-menu][open]").forEach(function (current) {
                if (current !== menu) current.removeAttribute("open");
              });
            }, true);

            document.addEventListener("pointerdown", function (event) {
              var target = event.target;
              if (!target || !target.closest || target.closest("[data-month-shift-menu]")) return;
              document.querySelectorAll("[data-month-shift-menu][open]").forEach(function (menu) {
                menu.removeAttribute("open");
              });
            });

            document.addEventListener("submit", function (event) {
              var form = event.target;
              if (!form || !form.getAttribute) return;
              var message = form.getAttribute("data-confirm-message");
              if (message && !window.confirm(message)) event.preventDefault();
            });
          })();
        `}
      </Script>
    </div>
  );
}
