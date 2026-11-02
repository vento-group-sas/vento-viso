/**
 * Proyección mínima de horas potencialmente extra por encima de 42 h/semana.
 * NO es una liquidación, autorización ni reemplazo de la jornada pactada:
 * un contrato inferior o un exceso diario puede generar horas extra antes.
 * Se incluyen turnos de todas las sedes y semanas completas intermensuales.
 */
export type OvertimeProjectionShift = {
  employee_id: string;
  shift_date: string;
  start_time: string;
  shift_kind: string;
  status: string;
};

export type MonthlyOvertimeProjection = {
  totalMinutes: number;
  ordinaryReferenceMinutes: number;
  possibleExtraMinutes: number;
};

export const GENERAL_WEEKLY_ORDINARY_REFERENCE_MINUTES = 42 * 60;

export function isoWeekStart(dateIso: string): string {
  const date = new Date(`${dateIso}T12:00:00Z`);
  if (!Number.isFinite(date.valueOf())) throw new Error("Fecha ISO inválida");
  const daysSinceMonday = (date.getUTCDay() + 6) % 7;
  date.setUTCDate(date.getUTCDate() - daysSinceMonday);
  return date.toISOString().slice(0, 10);
}

/**
 * Las filas de entrada deben abarcar semanas COMPLETAS, aun cuando crucen mes.
 * El lector de minutos es el mismo de las pantallas existentes de VISO.
 */
export function projectMonthlyPotentialOvertime<T extends OvertimeProjectionShift>(
  shifts: readonly T[],
  monthStartIso: string,
  monthEndIso: string,
  readMinutes: (shift: T) => number,
): Map<string, MonthlyOvertimeProjection> {
  const byEmployeeWeek = new Map<string, T[]>();
  for (const shift of shifts) {
    if (shift.status === "cancelled" || shift.shift_kind === "descanso") continue;
    const key = `${shift.employee_id}:${isoWeekStart(shift.shift_date)}`;
    const weekRows = byEmployeeWeek.get(key) ?? [];
    weekRows.push(shift);
    byEmployeeWeek.set(key, weekRows);
  }

  const result = new Map<string, MonthlyOvertimeProjection>();
  for (const weekRows of byEmployeeWeek.values()) {
    weekRows.sort((a, b) =>
      a.shift_date.localeCompare(b.shift_date)
      || a.start_time.localeCompare(b.start_time)
    );
    let weeklyUsedMinutes = 0;
    for (const shift of weekRows) {
      const minutes = Math.max(0, Number(readMinutes(shift)) || 0);
      const ordinary = Math.min(
        minutes,
        Math.max(0, GENERAL_WEEKLY_ORDINARY_REFERENCE_MINUTES - weeklyUsedMinutes),
      );
      weeklyUsedMinutes += minutes;
      if (shift.shift_date < monthStartIso || shift.shift_date > monthEndIso) continue;
      const current = result.get(shift.employee_id) ?? {
        totalMinutes: 0,
        ordinaryReferenceMinutes: 0,
        possibleExtraMinutes: 0,
      };
      current.totalMinutes += minutes;
      current.ordinaryReferenceMinutes += ordinary;
      current.possibleExtraMinutes += minutes - ordinary;
      result.set(shift.employee_id, current);
    }
  }
  return result;
}
