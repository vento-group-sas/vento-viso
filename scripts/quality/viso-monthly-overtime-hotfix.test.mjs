import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = (path) => readFileSync(new URL(`../../${path}`, import.meta.url), "utf8");

const constants = source("src/app/staff/schedule/month/constants.ts");
const page = source("src/app/staff/schedule/month/page.tsx");
const monthActions = source("src/app/staff/schedule/month/actions.ts");
const blockActions = source("src/app/staff/schedule/month/block-actions.ts");
const builder = source("src/components/viso/monthly-shift-builder.tsx");

test("VISO: no existe tope mensual fijo de 186 h en los cinco módulos del hotfix", () => {
  for (const file of [constants, page, monthActions, blockActions, builder]) {
    assert.doesNotMatch(file, /MONTHLY_SCHEDULE_LIMIT_(?:HOURS|MINUTES)|186\s*h|174\s*h/u);
  }
});

test("VISO: las 210 h son referencia salarial, nunca un tope de publicación", () => {
  assert.match(constants, /MONTHLY_SCHEDULE_REFERENCE_HOURS = 210;/u);
  assert.match(constants, /NO constituye un tope legal mensual/u);
  assert.match(page, /ref\. 210 h/u);
  assert.match(page, /no es un tope de publicación/u);
  assert.match(builder, /No determina horas extra legales/u);
});

test("VISO: se informa a la persona gestora sobre la referencia, sin tratarla como prohibición", () => {
  assert.match(page, /Sobre referencia:/u);
  assert.match(page, /no bloquean por sí solas/u);
  assert.doesNotMatch(page, /Publicación bloqueada por exceso mensual/u);
  assert.doesNotMatch(page, /employeesAboveReference\.length > 0 \|\|/u);
  assert.doesNotMatch(builder, /Excede por .*Se guardará únicamente como borrador/u);
});

test("VISO: la publicación exige confirmar revisión de jornadas y horas extra también en el servidor", () => {
  assert.match(page, /name="hours_reviewed" value="yes" required/u);
  assert.match(monthActions, /asText\(formData\.get\("hours_reviewed"\)\) !== "yes"/u);
  assert.match(monthActions, /\.update\(\{ published_at: publishedAt, published_by: user\.id \}\)/u);
  assert.match(monthActions, /await notifyShiftChange\(\{/u);
});

test("VISO: no queda veto del servidor por exceder una cifra mensual", () => {
  assert.doesNotMatch(monthActions, /const exceededIds/u);
  assert.doesNotMatch(monthActions, /No se puede publicar\. Hay trabajadores por encima/u);
  assert.match(monthActions, /Referencia salarial: 210 h \(no es un límite legal de publicación\)/u);
  assert.match(blockActions, /no existe un tope mensual fijo para publicar/u);
});

test("VISO: la referencia visual y el constructor mantienen sus contratos TS sincronizados", () => {
  assert.match(page, /referenceMinutes=\{MONTHLY_SCHEDULE_REFERENCE_MINUTES\}/u);
  assert.match(builder, /referenceMinutes: number;/u);
  assert.doesNotMatch(builder, /\blimitMinutes\b/u);
});

test("VISO: el hotfix NO sustituye autorización de extras ni protección SQL", () => {
  assert.match(page, /Este horario no liquida horas trabajadas/u);
  assert.match(page, /límites diarios y semanales/u);
  assert.match(monthActions, /requireStaffScheduleAccess/u);
});
