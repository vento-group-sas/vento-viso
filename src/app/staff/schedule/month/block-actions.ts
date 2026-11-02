"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { createAdminClient } from "@/lib/supabase/admin";

import {
  asText,
  cleanOptionalText,
  endOfMonth,
  FULL_DAY_REST_END_TIME,
  FULL_DAY_REST_START_TIME,
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

type MonthlyScheduleBlockInput = {
  shiftKind: "laboral" | "descanso";
  roleContext: string;
  startTime: string;
  endTime: string;
  notes: string;
  dates: string[];
};

type ResolvedMonthlyScheduleBlock = MonthlyScheduleBlockInput & {
  matrixRow: SiteOperationalRoleRow | null;
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

function parseMonthlyScheduleBlocks(value: string) {
  let parsed: unknown;
  try {
    parsed = JSON.parse(value);
  } catch {
    return {
      blocks: [] as MonthlyScheduleBlockInput[],
      error: "La configuración de horarios no es válida.",
    };
  }

  if (!Array.isArray(parsed)) {
    return {
      blocks: [] as MonthlyScheduleBlockInput[],
      error: "La configuración de horarios no es válida.",
    };
  }
  if (parsed.length > MAX_MONTHLY_SHIFT_BLOCKS) {
    return {
      blocks: [] as MonthlyScheduleBlockInput[],
      error: `Solo se permiten hasta ${MAX_MONTHLY_SHIFT_BLOCKS} bloques por operación.`,
    };
  }

  const blocks = parsed
    .map((raw): MonthlyScheduleBlockInput | null => {
      if (!raw || typeof raw !== "object") return null;
      const record = raw as Record<string, unknown>;
      const shiftKind = record.shiftKind === "descanso" ? "descanso" : "laboral";
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
        shiftKind,
        roleContext:
          shiftKind === "descanso" ? "" : readJsonString(record.roleContext, 200),
        startTime:
          shiftKind === "descanso"
            ? FULL_DAY_REST_START_TIME
            : readJsonString(record.startTime, 5),
        endTime:
          shiftKind === "descanso"
            ? FULL_DAY_REST_END_TIME
            : readJsonString(record.endTime, 5),
        notes: readJsonString(record.notes, 240),
        dates,
      };
    })
    .filter((block): block is MonthlyScheduleBlockInput => Boolean(block))
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

export async function createMonthlyScheduleBlocksAction(formData: FormData) {
  const employeeId = asText(formData.get("employee_id"));
  const siteId = asText(formData.get("site_id"));
  const month = asText(formData.get("month"));
  const returnTo =
    asText(formData.get("return_to")) || buildMonthReturnTo(siteId, month);
  const parsedBlocks = parseMonthlyScheduleBlocks(asText(formData.get("blocks_json")));

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
      "Configura al menos un bloque con uno o más días seleccionados.",
    );
  }

  const monthStartIso = isoDate(startOfMonth(monthDate));
  const monthEndIso = isoDate(endOfMonth(monthDate));
  const dateOwner = new Map<string, number>();

  for (const [index, block] of parsedBlocks.blocks.entries()) {
    if (block.shiftKind === "laboral") {
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
        redirectWithMessage(
          returnTo,
          "error",
          `El bloque ${index + 1} no tiene una duración válida.`,
        );
      }
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
          `El día ${Number(date.slice(-2))} aparece en los bloques ${previousBlock + 1} y ${index + 1}. Cada día puede pertenecer a un solo bloque.`,
        );
      }
      dateOwner.set(date, index);
    }
  }

  const employee = await validateEmployeeSiteLink(employeeId, siteId, returnTo);
  const supabase = createAdminClient();
  const hasLaboralBlocks = parsedBlocks.blocks.some(
    (block) => block.shiftKind === "laboral",
  );

  const [matrixResult, profilesResult] = hasLaboralBlocks
    ? await Promise.all([
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
      ])
    : [{ data: [], error: null }, { data: [], error: null }];

  if (matrixResult.error) {
    redirectWithMessage(returnTo, "error", matrixResult.error.message);
  }
  if (profilesResult.error) {
    redirectWithMessage(returnTo, "error", profilesResult.error.message);
  }

  const activeRows = (matrixResult.data ?? []) as Array<
    SiteOperationalRoleRow & { is_active?: boolean | null }
  >;
  const profiles = (profilesResult.data ?? []) as Array<{
    default_checkin_site_id?: string | null;
    default_checkout_site_id?: string | null;
    default_operational_role?: string | null;
    is_active?: boolean | null;
  }>;

  const resolvedBlocks: ResolvedMonthlyScheduleBlock[] = parsedBlocks.blocks.map(
    (block, index) => {
      if (block.shiftKind === "descanso") {
        return {
          ...block,
          matrixRow: null,
          checkinSiteId: null,
          checkoutSiteId: null,
        };
      }

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
      const rows = existingByDate.get(shiftDate) ?? [];
      const conflict =
        block.shiftKind === "descanso"
          ? rows[0]
          : rows.find((shift) => {
              if (shift.shift_kind === "descanso") return true;
              return block.startTime < shift.end_time && shift.start_time < block.endTime;
            });

      if (conflict) {
        const conflictLabel =
          conflict.shift_kind === "descanso"
            ? "un descanso"
            : `un turno de ${conflict.start_time.slice(0, 5)} a ${conflict.end_time.slice(0, 5)}`;
        redirectWithMessage(
          returnTo,
          "error",
          `Ya existe ${conflictLabel} el ${conflict.shift_date}. Elimina o corrige ese registro antes de guardar este bloque.`,
        );
      }
    }
  }

  const payload = resolvedBlocks.flatMap((block) =>
    block.dates.map((shiftDate) => ({
      employee_id: employeeId,
      site_id: siteId,
      area_id: block.shiftKind === "descanso" ? null : block.matrixRow?.area_id ?? null,
      shift_date: shiftDate,
      start_time:
        block.shiftKind === "descanso" ? FULL_DAY_REST_START_TIME : block.startTime,
      end_time:
        block.shiftKind === "descanso" ? FULL_DAY_REST_END_TIME : block.endTime,
      shift_kind: block.shiftKind,
      operational_role:
        block.shiftKind === "descanso" ? null : block.matrixRow?.role_code ?? null,
      show_end_as_close: false,
      break_minutes: 0,
      status: "scheduled",
      notes: block.notes || null,
      checkin_site_id: block.shiftKind === "descanso" ? null : block.checkinSiteId,
      checkout_site_id: block.shiftKind === "descanso" ? null : block.checkoutSiteId,
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
  const restCount = payload.filter((row) => row.shift_kind === "descanso").length;
  const laboralCount = payload.length - restCount;
  const savedDetail = [
    laboralCount > 0
      ? `${laboralCount} ${laboralCount === 1 ? "turno" : "turnos"}`
      : "",
    restCount > 0
      ? `${restCount} ${restCount === 1 ? "descanso" : "descansos"}`
      : "",
  ]
    .filter(Boolean)
    .join(" y ");

  if (projectedMinutes > MONTHLY_SCHEDULE_REFERENCE_MINUTES) {
    const excessMinutes = projectedMinutes - MONTHLY_SCHEDULE_REFERENCE_MINUTES;
    redirectWithMessage(
      returnTo,
      "warning",
      `${savedDetail} quedaron en borrador. ${employeeName} suma ${(projectedMinutes / 60).toFixed(1).replace(".", ",")} h; ${(excessMinutes / 60).toFixed(1).replace(".", ",")} h superan la referencia salarial mensual. La revisión de horas extra debe considerar jornada pactada y semanas completas; no existe un tope mensual fijo para publicar.`,
    );
  }

  redirectWithMessage(
    returnTo,
    "ok",
    `${savedDetail} guardados en borrador. Total proyectado: ${(projectedMinutes / 60).toFixed(1).replace(".", ",")} h (referencia salarial 210 h; no es un máximo legal).`,
  );
}
