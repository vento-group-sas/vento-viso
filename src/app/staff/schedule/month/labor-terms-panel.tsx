import {
  recordWeeklyOvertimeDecisionAction,
  registerLaborTermsAction,
} from "./actions";
import type {
  LaborTermsRow,
  LaborWeekReadiness,
  OvertimeDecisionRow,
} from "./labor-readiness";

type EmployeeOption = { id: string; label: string };

function hours(minutes: number) {
  return `${(minutes / 60).toLocaleString("es-CO", { maximumFractionDigits: 2 })} h`;
}

const statusText: Record<LaborWeekReadiness["state"], string> = {
  ready: "Validación preliminar conforme",
  missing_terms: "Falta jornada pactada",
  needs_authorization: "Falta autorización suficiente",
  exceeds_daily_or_weekly_limits: "Excede jornada diaria/semanal",
  invalid_shift: "Turno sin duración válida",
};

export function LaborTermsPanel({
  employees,
  terms,
  decisions,
  readiness,
  weeks,
  siteId,
  month,
  dataError,
}: {
  employees: EmployeeOption[];
  terms: LaborTermsRow[];
  decisions: OvertimeDecisionRow[];
  readiness: LaborWeekReadiness[];
  weeks: string[];
  siteId: string;
  month: string;
  dataError: string | null;
}) {
  const pending = readiness.filter((item) => item.state !== "ready");
  const referenceWeek = weeks[weeks.length - 1] ?? "";
  return (
    <details className="ui-panel space-y-4">
      <summary className="cursor-pointer text-sm font-semibold text-[var(--ui-text)]">
        Jornadas pactadas y autorizaciones de horas extra
        {pending.length > 0 ? ` · ${pending.length} semanas requieren intervención` : ""}
      </summary>
      <p className="mt-3 text-xs text-[var(--ui-muted)]">
        La jornada se registra por trabajador y vigencia semanal; la aprobación o
        revocación se registra para una semana completa, considerando todas sus sedes.
        Estos registros autorizan programación, no sustituyen las horas trabajadas,
        el registro diurno/nocturno ni la liquidación en ANIMA/NUMERA.
      </p>
      {dataError ? (
        <p className="rounded-lg border border-red-300 p-3 text-sm text-red-700">
          No se pudieron leer contratos o autorizaciones: {dataError}. No publiques hasta resolverlo.
        </p>
      ) : null}
      <div className="mt-3 grid gap-4 xl:grid-cols-2">
        <form action={registerLaborTermsAction} className="space-y-3 rounded-xl border border-[var(--ui-border)] p-4">
          <h3 className="text-sm font-semibold">1. Registrar jornada pactada</h3>
          <input type="hidden" name="site_id" value={siteId} />
          <input type="hidden" name="month" value={month} />
          <label className="block text-xs font-medium">Trabajador
            <select name="employee_id" required className="ui-input mt-1 w-full" defaultValue="">
              <option value="" disabled>Selecciona un trabajador</option>
              {employees.map((employee) => (
                <option key={employee.id} value={employee.id}>{employee.label}</option>
              ))}
            </select>
          </label>
          <label className="block text-xs font-medium">Vigente desde la semana del lunes
            <select name="effective_week" required className="ui-input mt-1 w-full" defaultValue="">
              <option value="" disabled>Selecciona el lunes de vigencia</option>
              {weeks.map((week) => <option key={week} value={week}>{week}</option>)}
            </select>
          </label>
          <div className="grid grid-cols-2 gap-3">
            <label className="block text-xs font-medium">Horas ordinarias/semana
              <input type="number" name="weekly_hours" min="1" max="42" step="0.25"
                placeholder="Ej. 36" required className="ui-input mt-1 w-full" />
            </label>
            <label className="block text-xs font-medium">Horas ordinarias/día
              <input type="number" name="daily_hours" min="1" max="9" step="0.25"
                placeholder="Ej. 8" required className="ui-input mt-1 w-full" />
            </label>
          </div>
          <label className="flex items-start gap-2 text-xs">
            <input type="checkbox" name="flexible_agreed" value="yes" className="mt-0.5" />
            Existe acuerdo explícito de distribución flexible (hasta 9 h ordinarias al día)
          </label>
          <label className="block text-xs font-medium">Referencia al acuerdo laboral
            <input name="agreement_reference" minLength={6} maxLength={240} required
              placeholder="Código o enlace del acuerdo verificado" className="ui-input mt-1 w-full" />
          </label>
          <p className="text-xs text-[var(--ui-muted)]">
            No se infiere la jornada desde una plantilla ni se sobrescribe el historial.
          </p>
          <button type="submit" className="ui-btn ui-btn--brand" disabled={!siteId || !employees.length || !!dataError}>
            Registrar vigencia
          </button>
        </form>

        <form action={recordWeeklyOvertimeDecisionAction} className="space-y-3 rounded-xl border border-[var(--ui-border)] p-4">
          <h3 className="text-sm font-semibold">2. Aprobar o revocar horas extra</h3>
          <input type="hidden" name="site_id" value={siteId} />
          <input type="hidden" name="month" value={month} />
          <label className="block text-xs font-medium">Trabajador
            <select name="employee_id" required className="ui-input mt-1 w-full" defaultValue="">
              <option value="" disabled>Selecciona un trabajador</option>
              {employees.map((employee) => (
                <option key={employee.id} value={employee.id}>{employee.label}</option>
              ))}
            </select>
          </label>
          <label className="block text-xs font-medium">Semana que comienza el lunes
            <select name="week_start" required className="ui-input mt-1 w-full" defaultValue="">
              <option value="" disabled>Selecciona la semana a autorizar</option>
              {weeks.map((week) => <option key={week} value={week}>{week}</option>)}
            </select>
          </label>
          <label className="block text-xs font-medium">Horas autorizadas (solo para aprobar; máximo 12)
            <input type="number" name="authorized_hours" min="0.25" max="12" step="0.25"
              placeholder="Ej. 4" className="ui-input mt-1 w-full" />
          </label>
          <label className="block text-xs font-medium">Motivo del trabajo suplementario
            <textarea name="reason" minLength={12} maxLength={500} required rows={2}
              className="ui-input mt-1 w-full" placeholder="Motivo operativo de la autorización" />
          </label>
          <label className="block text-xs font-medium">Referencia documental de la decisión
            <input name="approval_reference" minLength={6} maxLength={240} required
              placeholder="Código o enlace del soporte" className="ui-input mt-1 w-full" />
          </label>
          <p className="text-xs text-[var(--ui-muted)]">
            La revocación anula la autorización para publicaciones nuevas; conserva el historial previo.
            Solo personal con permiso staff.manage en todas las sedes del trabajador.
          </p>
          <div className="flex flex-wrap gap-2">
            <button type="submit" name="decision" value="approve" className="ui-btn ui-btn--brand"
              disabled={!siteId || !employees.length || !!dataError}>Aprobar</button>
            <button type="submit" name="decision" value="revoke" className="ui-btn ui-btn--ghost"
              disabled={!siteId || !employees.length || !!dataError}>Revocar</button>
          </div>
        </form>
      </div>

      <div className="mt-4 space-y-2">
        <h3 className="text-xs font-semibold">Estado por trabajador · programación del mes</h3>
        {employees.map((employee) => {
          const latestTerms = terms
            .filter((term) => term.employee_id === employee.id && term.effective_week <= referenceWeek)
            .sort((a, b) => b.effective_week.localeCompare(a.effective_week))[0];
          const weeklyRows = readiness.filter((item) => item.employeeId === employee.id);
          const latestApproved = decisions.filter((decision) =>
            decision.employee_id === employee.id && weeks.includes(decision.week_start)
          ).sort((a, b) => b.recorded_at.localeCompare(a.recorded_at) || b.id.localeCompare(a.id));
          return (
            <div key={employee.id} className="rounded-lg border border-[var(--ui-border)] px-3 py-2 text-xs">
              <div className="font-semibold">{employee.label}</div>
              <div className="mt-1 text-[var(--ui-muted)]">
                {latestTerms
                  ? `Jornada a fin de periodo: ${hours(latestTerms.ordinary_weekly_minutes)}/semana, ${hours(latestTerms.ordinary_daily_minutes)}/día · vigente ${latestTerms.effective_week}`
                  : "Sin jornada ordinaria registrada para el periodo"}
              </div>
              {weeklyRows.length > 0 ? (
                <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1">
                  {weeklyRows.map((week) => (
                    <span key={week.weekStart} className={week.state === "ready" ? "text-emerald-700" : "text-amber-800"}>
                      {week.weekStart}: {statusText[week.state]}
                      {" · "}posibles extras {hours(week.requiredExtraMinutes)}
                      {" · "}autorizadas {hours(week.authorizedExtraMinutes)}
                    </span>
                  ))}
                </div>
              ) : null}
              {latestApproved.length > 0 ? (
                <p className="mt-1 text-[var(--ui-muted)]">
                  Última decisión registrada en el mes: {latestApproved[0].decision === "revoke"
                    ? "revocación" : `aprobación de ${hours(latestApproved[0].authorized_minutes)}`}
                  {" · "}{latestApproved[0].week_start}
                </p>
              ) : null}
            </div>
          );
        })}
      </div>
    </details>
  );
}
