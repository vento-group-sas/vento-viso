import assert from "node:assert/strict";
import test from "node:test";
import {
  GENERAL_WEEKLY_ORDINARY_REFERENCE_MINUTES,
  isoWeekStart,
  projectMonthlyPotentialOvertime,
} from "../../src/app/staff/schedule/month/overtime-projection.ts";

const h = (hours) => hours * 60;
const row = (employee_id, shift_date, hours, site = "cafe", overrides = {}) => ({
  employee_id,
  shift_date,
  site_id: site,
  shift_kind: "laboral",
  status: "scheduled",
  start_time: "08:00",
  minutes: h(hours),
  ...overrides,
});
const project = (rows, start = "2026-11-01", end = "2026-11-30") =>
  projectMonthlyPotentialOvertime(rows, start, end, (shift) => shift.minutes);

test("42 h/semana constituyen la referencia ordinaria general", () => {
  assert.equal(GENERAL_WEEKLY_ORDINARY_REFERENCE_MINUTES, h(42));
  const r = project([row("e1", "2026-11-02", 42)]).get("e1");
  assert.deepEqual(r, { totalMinutes: h(42), ordinaryReferenceMinutes: h(42), possibleExtraMinutes: 0 });
});

test("42+2 h en la misma semana: 2 h potencialmente suplementarias", () => {
  const r = project([row("e1", "2026-11-02", 42), row("e1", "2026-11-05", 2)]).get("e1");
  assert.equal(r.possibleExtraMinutes, h(2));
  assert.equal(r.ordinaryReferenceMinutes, h(42));
});

test("la semana de 54 h muestra 12 h potenciales, sin otorgar autorización", () => {
  const r = project([row("e1", "2026-11-03", 42), row("e1", "2026-11-04", 12)]).get("e1");
  assert.equal(r.possibleExtraMinutes, h(12));
});

test("se suman sedes diferentes sin duplicar ordinarias", () => {
  const r = project([row("e1", "2026-11-02", 32, "cafe"), row("e1", "2026-11-06", 14, "saudo")]).get("e1");
  assert.deepEqual(r, { totalMinutes: h(46), ordinaryReferenceMinutes: h(42), possibleExtraMinutes: h(4) });
});

test("semana octubre-noviembre completa: el domingo 1 hereda horas de octubre", () => {
  assert.equal(isoWeekStart("2026-11-01"), "2026-10-26");
  const r = project([row("e1", "2026-10-30", 42), row("e1", "2026-11-01", 2)]).get("e1");
  assert.deepEqual(r, { totalMinutes: h(2), ordinaryReferenceMinutes: 0, possibleExtraMinutes: h(2) });
});

test("cada lunes reinicia la referencia semanal sin acumular meses", () => {
  const r = project([row("e1", "2026-11-01", 42), row("e1", "2026-11-02", 42)]).get("e1");
  assert.deepEqual(r, { totalMinutes: h(84), ordinaryReferenceMinutes: h(84), possibleExtraMinutes: 0 });
});

test("no se cuentan turnos cancelados ni días de descanso", () => {
  const r = project([
    row("e1", "2026-11-02", 42),
    row("e1", "2026-11-03", 10, "cafe", { status: "cancelled" }),
    row("e1", "2026-11-04", 24, "cafe", { shift_kind: "descanso" }),
  ]).get("e1");
  assert.equal(r.totalMinutes, h(42));
  assert.equal(r.possibleExtraMinutes, 0);
});

test("cada trabajador conserva su total y no hereda turnos ajenos", () => {
  const result = project([row("e1", "2026-11-02", 42), row("e2", "2026-11-02", 7)]);
  assert.equal(result.get("e1").totalMinutes, h(42));
  assert.equal(result.get("e2").totalMinutes, h(7));
  assert.equal(result.get("e2").possibleExtraMinutes, 0);
});

test("un febrero bisiesto se clasifica por semana ISO", () => {
  assert.equal(isoWeekStart("2028-02-29"), "2028-02-28");
  const r = project([row("e1", "2028-02-28", 42), row("e1", "2028-02-29", 2)], "2028-02-01", "2028-02-29").get("e1");
  assert.equal(r.possibleExtraMinutes, h(2));
});
