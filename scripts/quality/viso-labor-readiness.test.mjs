import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import ts from "typescript";
import { isoWeekStart } from "../../src/app/staff/schedule/month/overtime-projection.ts";

// Ejecuta la función real TS sin alterar la configuración ni el código fuente
// del proyecto Next. La dependencia interna se resuelve con su export real.
const tsSource = readFileSync(
  new URL("../../src/app/staff/schedule/month/labor-readiness.ts", import.meta.url),
  "utf8",
);
const compiled = ts.transpileModule(tsSource, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;
const isolated = { exports: {} };
new Function("require", "module", "exports", compiled)(
  (specifier) => {
    if (specifier === "./overtime-projection") return { isoWeekStart };
    throw new Error(`Dependencia no autorizada en prueba: ${specifier}`);
  },
  isolated,
  isolated.exports,
);
const { evaluateLaborPublication } = isolated.exports;

const iso = "2026-11-02";
const monthStart = "2026-11-01";
const monthEnd = "2026-11-30";
const term = (employee_id, ordinary_weekly_minutes = 36 * 60, ordinary_daily_minutes = 8 * 60) => ({
  employee_id,
  effective_week: iso,
  ordinary_weekly_minutes,
  ordinary_daily_minutes,
  flexible_daily_agreement: false,
});
const shift = (day, duration, site = "site-a", published = null, employee_id = "worker") => ({
  employee_id, site_id: site, shift_date: day, status: "scheduled", shift_kind: "laboral",
  published_at: published, minutes: duration * 60,
});
const decision = (minutes, kind = "approve", recorded_at = "2026-11-02T13:00:00Z") => ({
  employee_id: "worker", week_start: iso, id: recorded_at,
  decision: kind, authorized_minutes: minutes, recorded_at,
});
const evaluate = (rows, terms = [], approvals = [], siteId = "site-a") =>
  evaluateLaborPublication(rows, terms, approvals, siteId, monthStart, monthEnd, (r) => r.minutes);
const fiveDays = [
  shift("2026-11-02", 8), shift("2026-11-03", 8, "site-b", "published"),
  shift("2026-11-04", 8), shift("2026-11-05", 8), shift("2026-11-06", 8),
];

test("Falta el contrato: estado missing_terms sin asignar 42h arbitrariamente", () => {
  const [week] = evaluate([shift(iso, 8)]);
  assert.equal(week.state, "missing_terms");
  assert.equal(week.ordinaryWeeklyMinutes, null);
});

test("Contrato 36h y 40h programadas: 4h extras pendientes", () => {
  const [week] = evaluate(fiveDays, [term("worker")]);
  assert.equal(week.requiredExtraMinutes, 240);
  assert.equal(week.state, "needs_authorization");
});

test("Aprobación de 4h habilita la validación preliminar", () => {
  const [week] = evaluate(fiveDays, [term("worker")], [decision(240)]);
  assert.equal(week.authorizedExtraMinutes, 240);
  assert.equal(week.state, "ready");
});

test("Revocación posterior sustituye a la aprobación histórica sin borrarla", () => {
  const [week] = evaluate(fiveDays, [term("worker")], [
    decision(720, "approve", "2026-11-02T08:00:00Z"),
    decision(0, "revoke", "2026-11-02T15:00:00Z"),
  ]);
  assert.equal(week.state, "needs_authorization");
  assert.equal(week.authorizedExtraMinutes, 0);
});

test("Exceso diario de 9h requiere 1h autorizada aun sin llegar a 42h semanales", () => {
  const [week] = evaluate([shift(iso, 9)], [term("worker", 42 * 60)]);
  assert.equal(week.requiredExtraMinutes, 60);
});

test("Combina published de otra sede y borrador de sede activa", () => {
  const [week] = evaluate([
    shift("2026-11-02", 8, "site-b", "published"),
    shift("2026-11-03", 8, "site-b", "published"),
    shift("2026-11-04", 8, "site-b", "published"),
    shift("2026-11-05", 8, "site-b", "published"),
    shift("2026-11-06", 8),
  ], [term("worker")]);
  assert.equal(week.scheduledMinutes, 40 * 60);
  assert.equal(week.requiredExtraMinutes, 4 * 60);
});

test("Excluye borradores de otras sedes para evitar doble publicación proyectada", () => {
  const [week] = evaluate([shift(iso, 8, "site-a"), shift("2026-11-03", 20, "site-b")],
    [term("worker")]);
  assert.equal(week.scheduledMinutes, 8 * 60);
  assert.equal(week.state, "ready");
});

test("Siete días de trabajo activan bloqueo aun con pocas horas", () => {
  const rows = Array.from({ length: 7 }, (_, day) =>
    shift(`2026-11-${String(day + 2).padStart(2, "0")}`, 1));
  const [week] = evaluate(rows, [term("worker", 42 * 60)]);
  assert.equal(week.state, "exceeds_daily_or_weekly_limits");
});

test("Contrato 36h: 49h/semana superan el total ordinario +12", () => {
  const rows = [
    shift(iso, 10), shift("2026-11-03", 10), shift("2026-11-04", 10),
    shift("2026-11-05", 10), shift("2026-11-06", 9),
  ];
  const [week] = evaluate(rows, [term("worker")], [decision(720)]);
  assert.equal(week.state, "exceeds_daily_or_weekly_limits");
});

test("Sin borradores de la sede objetivo no inventa bloqueos a la publicación", () => {
  const rows = [shift(iso, 9, "site-b", "published")];
  assert.equal(evaluate(rows, [term("worker")]).length, 0);
});

test("Cruce mensual octubre-noviembre usa la misma semana ISO", () => {
  const rows = [
    shift("2026-10-26", 8, "site-b", "published"),
    shift("2026-10-27", 8, "site-b", "published"),
    shift("2026-10-28", 8, "site-b", "published"),
    shift("2026-10-29", 8, "site-b", "published"),
    shift("2026-10-30", 4, "site-b", "published"),
    shift("2026-11-01", 2),
  ];
  const terms = [{ ...term("worker"), effective_week: "2026-10-26" }];
  const [week] = evaluate(rows, terms);
  assert.equal(week.weekStart, "2026-10-26");
  assert.equal(week.requiredExtraMinutes, 2 * 60);
});
