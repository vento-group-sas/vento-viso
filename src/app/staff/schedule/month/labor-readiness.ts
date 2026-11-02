import { isoWeekStart } from "./overtime-projection";

export type LaborTermsRow = {
  employee_id: string;
  effective_week: string;
  ordinary_weekly_minutes: number;
  ordinary_daily_minutes: number;
  flexible_daily_agreement: boolean;
  agreement_reference?: string;
};

export type OvertimeDecisionRow = {
  id: string;
  employee_id: string;
  week_start: string;
  decision: "approve" | "revoke";
  authorized_minutes: number;
  recorded_at: string;
};

export type LaborShift = {
  employee_id: string;
  site_id: string;
  shift_date: string;
  published_at?: string | null;
  status: string;
  shift_kind?: string | null;
};

export type LaborWeekReadiness = {
  employeeId: string;
  weekStart: string;
  scheduledMinutes: number;
  requiredExtraMinutes: number;
  authorizedExtraMinutes: number;
  ordinaryWeeklyMinutes: number | null;
  ordinaryDailyMinutes: number | null;
  state: "ready" | "missing_terms" | "needs_authorization" | "exceeds_daily_or_weekly_limits" | "invalid_shift";
};

/**
 * Proyección UX, jamás autoritativa: PostgreSQL verifica de forma transaccional.
 * Solo se incorporan las horas publicadas de otras sedes y los borradores de
 * la sede/mes que se están publicando; no incluye borradores de otras sedes.
 */
export function evaluateLaborPublication<T extends LaborShift>(
  shifts: readonly T[],
  terms: readonly LaborTermsRow[],
  decisions: readonly OvertimeDecisionRow[],
  siteId: string,
  monthStart: string,
  monthEnd: string,
  readMinutes: (shift: T) => number,
): LaborWeekReadiness[] {
  const groups = new Map<string, T[]>();
  const affected = new Set<string>();
  for (const shift of shifts) {
    if (shift.status === "cancelled" || shift.shift_kind === "descanso") continue;
    const targetDraft =
      !shift.published_at &&
      shift.site_id === siteId &&
      shift.shift_date >= monthStart &&
      shift.shift_date <= monthEnd;
    if (!targetDraft && !shift.published_at) continue;
    const weekStart = isoWeekStart(shift.shift_date);
    const key = `${shift.employee_id}:${weekStart}`;
    const rows = groups.get(key) ?? [];
    rows.push(shift);
    groups.set(key, rows);
    if (targetDraft) affected.add(key);
  }

  const result: LaborWeekReadiness[] = [];
  for (const key of affected) {
    const rows = groups.get(key) ?? [];
    const first = rows[0];
    if (!first) continue;
    const weekStart = isoWeekStart(first.shift_date);
    const employeeId = first.employee_id;
    const activeTerms = terms
      .filter((t) => t.employee_id === employeeId && t.effective_week <= weekStart)
      .sort((a, b) => b.effective_week.localeCompare(a.effective_week))[0];

    const dayTotals = new Map<string, number>();
    let invalidShift = false;
    for (const row of rows) {
      const minutes = readMinutes(row);
      if (!Number.isInteger(minutes) || minutes <= 0) invalidShift = true;
      dayTotals.set(row.shift_date, (dayTotals.get(row.shift_date) ?? 0) + Math.max(0, minutes));
    }
    const scheduledMinutes = [...dayTotals.values()].reduce((sum, value) => sum + value, 0);
    if (!activeTerms) {
      result.push({
        employeeId, weekStart, scheduledMinutes, requiredExtraMinutes: 0,
        authorizedExtraMinutes: 0, ordinaryWeeklyMinutes: null,
        ordinaryDailyMinutes: null, state: "missing_terms",
      });
      continue;
    }

    const requiredExtraMinutes = Math.max(
      0, scheduledMinutes - activeTerms.ordinary_weekly_minutes,
      [...dayTotals.values()].reduce(
        (sum, value) => sum + Math.max(0, value - activeTerms.ordinary_daily_minutes), 0,
      ),
    );
    const decision = decisions
      .filter((d) => d.employee_id === employeeId && d.week_start === weekStart)
      .sort((a, b) => b.recorded_at.localeCompare(a.recorded_at) || b.id.localeCompare(a.id))[0];
    const authorizedExtraMinutes = decision?.decision === "approve"
      ? decision.authorized_minutes
      : 0;
    const exceeds = dayTotals.size > 6 ||
      scheduledMinutes > Math.min(3240, activeTerms.ordinary_weekly_minutes + 720) ||
      [...dayTotals.values()].some((total) => total >
        Math.min(660, activeTerms.ordinary_daily_minutes + 120));
    const state: LaborWeekReadiness["state"] = invalidShift
      ? "invalid_shift"
      : exceeds
        ? "exceeds_daily_or_weekly_limits"
        : requiredExtraMinutes > authorizedExtraMinutes
          ? "needs_authorization"
          : "ready";
    result.push({
      employeeId, weekStart, scheduledMinutes, requiredExtraMinutes,
      authorizedExtraMinutes, ordinaryWeeklyMinutes: activeTerms.ordinary_weekly_minutes,
      ordinaryDailyMinutes: activeTerms.ordinary_daily_minutes, state,
    });
  }
  return result.sort((a, b) =>
    a.employeeId.localeCompare(b.employeeId) || a.weekStart.localeCompare(b.weekStart));
}
