"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { notifyShiftChange } from "@/lib/anima/shift-notify";
import { requireAppAccess } from "@/lib/auth/guard";
import { createAdminClient } from "@/lib/supabase/admin";

import {
  asText,
  cleanOptionalText,
  endOfMonth,
  getShiftMinutes,
  isoDate,
  requireStaffScheduleAccess,
  startOfMonth,
  type EmployeeRow,
  type ShiftRow,
  type SiteOperationalRoleRow,
} from "../helpers";
import { MONTHLY_SCHEDULE_REFERENCE_MINUTES } from "./constants";

const MAX_MONTHLY_SHIFT_BLOCKS = 12;

type MonthlyShiftBlockInput = {
  roleContext: string;
  startTime: string;
  endTime: string;
  notes: string;
  dates: string[];
};

type ResolvedMonthlyShiftBlock = MonthlyShiftBlockInput & {
  matrixRow: SiteOperationalRoleRow;
  checkinSiteId: string | null;
  checkoutSiteId: string | null;
};

function parseMonth(value: string) {
  const match = /^(\d{4})-(\d{2})$/.exec(value);
  if (!match) return null;
  const year = Number(match[1]);
  const monthIndex = Number(match[2]) - 1;
  if (!Number.isInteger(year) || monthIndex < 0 || monthIndex > 11) return null;
  return new Date(year, monthIndex, 1, 12, 0, 0, 0);
}

function buildMonthReturnTo(siteId: string, month: string) {
  const query = new URLSearchParams();
  if (siteId) query.set("site_id", siteId);
  if (month) query.set("month", month);
  return `/staff/schedule/month?${query.toString()}`;
}

function redirectWithMessage(
  returnTo: string,
  type: "ok" | "error" | "warning",
  message: string,
): never {
  const separator = returnTo.includes("?") ? "&" : "?";
  redirect(`${returnTo}${separator}${type}=${encodeURIComponent(message)}`);
}

function normalizeRoleContext(value: string) {
  const [roleCode = "", areaId = ""] = value.split("||");
  return {
    roleCode: roleCode.trim(),
    areaId: cleanOptionalText(areaId),
  };
}

function readJsonString(value: unknown, maxLength = 500) {
  return typeof value === "string" ? value.trim().slice(0, maxLength) : "";
}

function parseMonthlyShiftBlocks(value: string) {
  let parsed: unknown;
  try {
    parsed = JSON.parse(value);
  } catch {
    return { blocks: [] as MonthlyShiftBlockInput[], error: "La configuración de horarios no es válida." };
  }

  if (!Array.isArray(parsed)) {
    return { blocks: [] as MonthlyShiftBlockInput[], error: "La configuración de horarios no es válida." };
  }
  if (parsed.length > MAX_MONTHLY_SHIFT_BLOCKS) {
    return {
      blocks: [] as MonthlyShiftBlockInput[],
      error: `Solo se permiten hasta ${MAX_MONTHLY_SHIFT_BLOCKS} horarios por operación.`,
    };
  }

  const blocks = parsed
    .map((raw): MonthlyShiftBlockInput | null => {
      if (!raw || typeof raw !== "object") return null;
      const record = raw as Record<string, unknown>;
      const dates = Array.isArray(record.dates)
        ? [
            ...new Set(
              record.dates
                .map((date) => readJsonString(date, 10))
                .filter(Boolean),
            ),
          ].sort()
        : [];

      return {
        roleContext: readJsonString(record.roleContext, 200),
        startTime: readJsonString(record.startTime, 5),
        endTime: readJsonString(record.endTime, 5),
        notes: readJsonString(record.notes, 240),
        dates,
      };
    })
    .filter((block): block is MonthlyShiftBlockInput => Boolean(block))
    .filter((block) => block.dates.length > 0);

  return { blocks, error: "" };
}

function isValidTime(value: string) {
  const match = /^(\d{2}):(\d{2})$/.exec(value);
  if (!match) return false;
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  return hours >= 0 && hours <= 23 && minutes >= 0 && minutes <= 59;
}

function resolveMatrixRow(
  rows: Array<SiteOperationalRoleRow & { is_active?: boolean | null }>,
  roleContextValue: string,
) {
  const roleContext = normalizeRoleContext(roleContextValue);
  let selected = rows.find(
    (row) =>
      row.role_code === roleContext.roleCode &&
      cleanOptionalText(row.area_id) === roleContext.areaId,
  );

  if (!selected && roleContext.roleCode) {
    const roleRows = rows.filter((row) => row.role_code === roleContext.roleCode);
    selected =
      roleRows.find((row) => row.is_default) ??
      (roleRows.length === 1 ? roleRows[0] : undefined);
  }

  return selected ?? null;
}

async function validateEmployeeSiteLink(
  employeeId: string,
  siteId: string,
  returnTo: string,
) {
  const supabase = createAdminClient();
  const { data: employee, error: employeeError } = await supabase
    .from("employees")
    .select("id,full_name,alias,role,is_active,site_id")
    .eq("id", employeeId)
    .eq("is_active", true)
    .maybeSingle();

  if (employeeError) redirectWithMessage(returnTo, "error", employeeError.message);
  if (!employee) {
    redirectWithMessage(returnTo, "error", "El trabajador no existe o está inactivo.");
  }

  if ((employee as EmployeeRow).site_id === siteId) return employee as EmployeeRow;

  const { data: siteLink, error: siteLinkError } = await supabase
    .from("employee_sites")
    .select("employee_id")
    .eq("employee_id", employeeId)
    .eq("site_id", siteId)
    .eq("is_active", true)
    .maybeSingle();

  if (siteLinkError) redirectWithMessage(returnTo, "error", siteLinkError.message);
  if (!siteLink) {
    redirectWithMessage(
      returnTo,
      "error",
      "El trabajador no está vinculado a la sede seleccionada.",
    );
  }

  return employee as EmployeeRow;
}

export async function createMonthlyShiftsAction(formData: FormData) {
  const employeeId = asText(formData.get("employee_id"));
  const siteId = asText(formData.get("site_id"));
  const month = asText(formData.get("month"));
  const returnTo =
    asText(formData.get("return_to")) || buildMonthReturnTo(siteId, month);
  const parsedBlocks = parseMonthlyShiftBlocks(asText(formData.get("blocks_json")));

  await requireStaffScheduleAccess(returnTo, siteId);

  const monthDate = parseMonth(month);
  if (!employeeId || !siteId || !monthDate) {
    redirectWithMessage(returnTo, "error", "Trabajador, sede o mes inválidos.");
  }
  if (parsedBlocks.error) {
    redirectWithMessage(returnTo, "error", parsedBlocks.error);
  }
  if (parsedBlocks.blocks.length === 0) {
    redirectWithMessage(
      returnTo,
      "error",
      "Configura al menos un horario con uno o más días seleccionados.",
    );
  }

  const monthStartIso = isoDate(startOfMonth(monthDate));
  const monthEndIso = isoDate(endOfMonth(monthDate));
  const dateOwner = new Map<string, number>();

  for (const [index, block] of parsedBlocks.blocks.entries()) {
    if (!block.roleContext || !isValidTime(block.startTime) || !isValidTime(block.endTime)) {
      redirectWithMessage(
        returnTo,
        "error",
        `Completa el área, rol y horario del bloque ${index + 1}.`,
      );
    }
    if (block.endTime <= block.startTime) {
      redirectWithMessage(
        returnTo,
        "error",
        `La hora de fin del bloque ${index + 1} debe ser posterior a la hora de inicio.`,
      );
    }

    const minutes = getShiftMinutes({
      start_time: block.startTime,
      end_time: block.endTime,
      break_minutes: 0,
      shift_kind: "laboral",
    });
    if (minutes <= 0) {
      redirectWithMessage(returnTo, "error", `El bloque ${index + 1} no tiene una duración válida.`);
    }

    for (const date of block.dates) {
      if (
        !/^\d{4}-\d{2}-\d{2}$/.test(date) ||
        date < monthStartIso ||
        date > monthEndIso
      ) {
        redirectWithMessage(
          returnTo,
          "error",
          "Todos los días seleccionados deben pertenecer al mes visible.",
        );
      }
      const previousBlock = dateOwner.get(date);
      if (previousBlock !== undefined) {
        redirectWithMessage(
          returnTo,
          "error",
          `El día ${Number(date.slice(-2))} aparece en los bloques ${previousBlock + 1} y ${index + 1}. Cada día puede pertenecer a un solo horario en esta modalidad.`,
        );
      }
      dateOwner.set(date, index);
    }
  }

  const employee = await validateEmployeeSiteLink(employeeId, siteId, returnTo);
  const supabase = createAdminClient();

  const [{ data: matrixRows, error: matrixError }, { data: profileRows, error: profileError }] =
    await Promise.all([
      supabase
        .from("vento_site_operational_role_matrix_v1")
        .select(
          "site_id,area_id,area_name,area_kind,role_code,role_label,role_family,is_default,requires_external_checkin,requires_external_checkout,is_active",
        )
        .eq("site_id", siteId)
        .eq("is_active", true),
      supabase
        .from("employee_site_operational_profiles")
        .select(
          "default_checkin_site_id,default_checkout_site_id,default_operational_role,is_active",
        )
        .eq("employee_id", employeeId)
        .eq("site_id", siteId)
        .neq("is_active", false),
    ]);

  if (matrixError) redirectWithMessage(returnTo, "error", matrixError.message);
  if (profileError) redirectWithMessage(returnTo, "error", profileError.message);

  const activeRows = (matrixRows ?? []) as Array<SiteOperationalRoleRow & {
    is_active?: boolean | null;
  }>;
  const profiles = (profileRows ?? []) as Array<{
    default_checkin_site_id?: string | null;
    default_checkout_site_id?: string | null;
    default_operational_role?: string | null;
    is_active?: boolean | null;
  }>;

  const resolvedBlocks: ResolvedMonthlyShiftBlock[] = parsedBlocks.blocks.map(
    (block, index) => {
      const matrixRow = resolveMatrixRow(activeRows, block.roleContext);
      if (!matrixRow) {
        redirectWithMessage(
          returnTo,
          "error",
          `Selecciona un área y rol operativo válidos en el bloque ${index + 1}.`,
        );
      }

      const profile = profiles.find(
        (candidate) =>
          cleanOptionalText(candidate.default_operational_role) === matrixRow.role_code,
      );
      const checkinSiteId = cleanOptionalText(profile?.default_checkin_site_id);
      const checkoutSiteId = cleanOptionalText(profile?.default_checkout_site_id);

      if (matrixRow.requires_external_checkin && !checkinSiteId) {
        redirectWithMessage(
          returnTo,
          "error",
          `El rol del bloque ${index + 1} exige un punto externo de entrada y el trabajador no lo tiene configurado.`,
        );
      }
      if (matrixRow.requires_external_checkout && !checkoutSiteId) {
        redirectWithMessage(
          returnTo,
          "error",
          `El rol del bloque ${index + 1} exige un punto externo de salida y el trabajador no lo tiene configurado.`,
        );
      }

      return {
        ...block,
        matrixRow,
        checkinSiteId,
        checkoutSiteId,
      };
    },
  );

  const selectedDates = [...dateOwner.keys()].sort();
  const { data: existingRows, error: existingError } = await supabase
    .from("employee_shifts")
    .select(
      "id,employee_id,shift_date,start_time,end_time,shift_kind,operational_role,show_end_as_close,break_minutes,status,notes,site_id,area_id,checkin_site_id,checkout_site_id,published_at",
    )
    .eq("employee_id", employeeId)
    .in("shift_date", selectedDates)
    .neq("status", "cancelled");

  if (existingError) redirectWithMessage(returnTo, "error", existingError.message);

  const existingByDate = new Map<string, ShiftRow[]>();
  for (const shift of (existingRows ?? []) as ShiftRow[]) {
    const rows = existingByDate.get(shift.shift_date) ?? [];
    rows.push(shift);
    existingByDate.set(shift.shift_date, rows);
  }

  for (const block of resolvedBlocks) {
    for (const shiftDate of block.dates) {
      const conflict = (existingByDate.get(shiftDate) ?? []).find((shift) => {
        if (shift.shift_kind === "descanso") return true;
        return block.startTime < shift.end_time && shift.start_time < block.endTime;
      });
      if (conflict) {
        redirectWithMessage(
          returnTo,
          "error",
          `Ya existe un turno o descanso que se cruza el ${conflict.shift_date} (${conflict.start_time.slice(0, 5)}–${conflict.end_time.slice(0, 5)}).`,
        );
      }
    }
  }

  const payload = resolvedBlocks.flatMap((block) =>
    block.dates.map((shiftDate) => ({
      employee_id: employeeId,
      site_id: siteId,
      area_id: block.matrixRow.area_id ?? null,
      shift_date: shiftDate,
      start_time: block.startTime,
      end_time: block.endTime,
      shift_kind: "laboral",
      operational_role: block.matrixRow.role_code ?? null,
      show_end_as_close: false,
      break_minutes: 0,
      status: "scheduled",
      notes: block.notes || null,
      checkin_site_id: block.checkinSiteId,
      checkout_site_id: block.checkoutSiteId,
      published_at: null,
      published_by: null,
    })),
  );

  const { error: insertError } = await supabase
    .from("employee_shifts")
    .insert(payload);
  if (insertError) redirectWithMessage(returnTo, "error", insertError.message);

  const { data: monthRows, error: totalError } = await supabase
    .from("employee_shifts")
    .select(
      "id,employee_id,shift_date,start_time,end_time,shift_kind,operational_role,show_end_as_close,break_minutes,status,notes,site_id,area_id,checkin_site_id,checkout_site_id,published_at",
    )
    .eq("employee_id", employeeId)
    .gte("shift_date", monthStartIso)
    .lte("shift_date", monthEndIso)
    .neq("status", "cancelled");

  if (totalError) redirectWithMessage(returnTo, "error", totalError.message);

  const projectedMinutes = ((monthRows ?? []) as ShiftRow[]).reduce(
    (total, shift) => total + getShiftMinutes(shift),
    0,
  );

  revalidatePath("/staff");
  revalidatePath("/staff/schedule");
  revalidatePath("/staff/schedule/month");

  const employeeName =
    employee.full_name ?? employee.alias ?? "El trabajador seleccionado";
  const blockCount = resolvedBlocks.length;
  if (projectedMinutes > MONTHLY_SCHEDULE_REFERENCE_MINUTES) {
    const excessMinutes = projectedMinutes - MONTHLY_SCHEDULE_REFERENCE_MINUTES;
    redirectWithMessage(
      returnTo,
      "warning",
      `${payload.length} turnos de ${blockCount} ${blockCount === 1 ? "horario" : "horarios"} quedaron en borrador. ${employeeName} suma ${(projectedMinutes / 60).toFixed(1).replace(".", ",")} h, ${(excessMinutes / 60).toFixed(1).replace(".", ",")} h sobre la referencia salarial mensual. Revisa la jornada pactada y la autorización de horas extra. La referencia no bloquea publicar.`,
    );
  }

  redirectWithMessage(
    returnTo,
    "ok",
    `${payload.length} ${payload.length === 1 ? "turno guardado" : "turnos guardados"} en ${blockCount} ${blockCount === 1 ? "horario" : "horarios"}. Total proyectado: ${(projectedMinutes / 60).toFixed(1).replace(".", ",")} h. Referencia salarial: 210 h (no es un límite legal de publicación).`,
  );
}

export async function deleteMonthlyDraftShiftAction(formData: FormData) {
  const shiftId = asText(formData.get("shift_id"));
  const siteId = asText(formData.get("site_id"));
  const month = asText(formData.get("month"));
  const returnTo =
    asText(formData.get("return_to")) || buildMonthReturnTo(siteId, month);

  await requireStaffScheduleAccess(returnTo, siteId);
  if (!shiftId) redirectWithMessage(returnTo, "error", "Turno inválido.");

  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("employee_shifts")
    .delete()
    .eq("id", shiftId)
    .eq("site_id", siteId)
    .is("published_at", null)
    .select("id")
    .maybeSingle();

  if (error) redirectWithMessage(returnTo, "error", error.message);
  if (!data) {
    redirectWithMessage(
      returnTo,
      "error",
      "El turno ya está publicado o no pertenece a esta sede. No se eliminó.",
    );
  }

  revalidatePath("/staff/schedule");
  revalidatePath("/staff/schedule/month");
  redirectWithMessage(returnTo, "ok", "Borrador eliminado.");
}

export async function deleteMonthlyDraftsAction(formData: FormData) {
  const siteId = asText(formData.get("site_id"));
  const month = asText(formData.get("month"));
  const returnTo =
    asText(formData.get("return_to")) || buildMonthReturnTo(siteId, month);

  await requireStaffScheduleAccess(returnTo, siteId);
  const monthDate = parseMonth(month);
  if (!siteId || !monthDate) {
    redirectWithMessage(returnTo, "error", "Mes o sede inválidos.");
  }

  const supabase = createAdminClient();
  const { error } = await supabase
    .from("employee_shifts")
    .delete()
    .eq("site_id", siteId)
    .gte("shift_date", isoDate(startOfMonth(monthDate)))
    .lte("shift_date", isoDate(endOfMonth(monthDate)))
    .is("published_at", null);

  if (error) redirectWithMessage(returnTo, "error", error.message);

  revalidatePath("/staff/schedule");
  revalidatePath("/staff/schedule/month");
  redirectWithMessage(returnTo, "ok", "Borradores del mes eliminados.");
}

export async function publishMonthAction(formData: FormData) {
  const siteId = asText(formData.get("site_id"));
  const month = asText(formData.get("month"));
  const returnTo =
    asText(formData.get("return_to")) || buildMonthReturnTo(siteId, month);

  const { user } = await requireStaffScheduleAccess(returnTo, siteId);
  // Publicar turnos (incluidas posibles horas extra) requiere permiso real
  // de administración. staff.schedule.view sólo permite visualizar horarios.
  await requireAppAccess({
    appId: "viso",
    returnTo,
    permissionCode: "staff.manage",
    siteId,
    allowPermissionAccess: true,
  });
  if (asText(formData.get("hours_reviewed")) !== "yes") {
    redirectWithMessage(returnTo, "error", "Confirma la revisión de jornada pactada, descansos y horas extra antes de publicar.");
  }
  const monthDate = parseMonth(month);
  if (!siteId || !monthDate) {
    redirectWithMessage(returnTo, "error", "Mes o sede inválidos.");
  }

  const monthStartIso = isoDate(startOfMonth(monthDate));
  const monthEndIso = isoDate(endOfMonth(monthDate));
  const supabase = createAdminClient();

  const { data: shiftRowsData, error: shiftsError } = await supabase
    .from("employee_shifts")
    .select(
      "id,employee_id,shift_date,start_time,end_time,shift_kind,operational_role,show_end_as_close,break_minutes,status,notes,site_id,area_id,checkin_site_id,checkout_site_id,published_at",
    )
    .eq("site_id", siteId)
    .gte("shift_date", monthStartIso)
    .lte("shift_date", monthEndIso);

  if (shiftsError) redirectWithMessage(returnTo, "error", shiftsError.message);

  const shifts = (shiftRowsData ?? []) as ShiftRow[];
  if (shifts.length === 0) {
    redirectWithMessage(returnTo, "error", "No hay turnos en este mes.");
  }

  const draftRows = shifts.filter((shift) => !shift.published_at);
  if (draftRows.length === 0) {
    redirectWithMessage(returnTo, "ok", "No hay borradores por publicar.");
  }

  const publishedAt = new Date().toISOString();
  const { error: updateError } = await supabase
    .from("employee_shifts")
    .update({ published_at: publishedAt, published_by: user.id })
    .eq("site_id", siteId)
    .gte("shift_date", monthStartIso)
    .lte("shift_date", monthEndIso)
    .is("published_at", null);

  if (updateError) redirectWithMessage(returnTo, "error", updateError.message);

  const monthLabel = monthDate.toLocaleDateString("es-CO", {
    month: "long",
    year: "numeric",
  });
  await notifyShiftChange({
    employeeIds: [...new Set(draftRows.map((row) => row.employee_id))],
    title: "Tu horario mensual fue publicado",
    body: `Revisa tus turnos de ${monthLabel} en ANIMA.`,
    data: {
      siteId,
      month,
      action: "published_month",
      source: "viso_schedule_month_planner",
    },
  });

  revalidatePath("/staff");
  revalidatePath("/staff/schedule");
  revalidatePath("/staff/schedule/month");
  redirectWithMessage(returnTo, "ok", "Mes publicado y notificado.");
}
