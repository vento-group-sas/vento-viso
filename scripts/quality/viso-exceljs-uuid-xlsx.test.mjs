import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import test from 'node:test';

const require = createRequire(import.meta.url);
const ExcelJS = require('exceljs');
const requireFromExcelJS = createRequire(require.resolve('exceljs'));

test('VISO XLSX QA: ExcelJS loads the patched UUID through CommonJS', () => {
  assert.equal(require('exceljs/package.json').version, '4.4.0');
  assert.equal(requireFromExcelJS('uuid/package.json').version, '11.1.1');
  const { v4 } = requireFromExcelJS('uuid');
  assert.equal(typeof v4, 'function');
  assert.match(v4(), /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i);

  // Exercise ExcelJS's own call site that imports uuid.v4().
  const CfRuleExtXform = require('exceljs/lib/xlsx/xform/sheet/cf-ext/cf-rule-ext-xform');
  const rule = { type: 'iconSet', iconSet: '3Triangles', priority: 1 };
  new CfRuleExtXform().prepare(rule);
  assert.match(rule.x14Id, /^\{[0-9A-F]{8}-[0-9A-F]{4}-4[0-9A-F]{3}-[89AB][0-9A-F]{3}-[0-9A-F]{12}\}$/);
});

test('VISO XLSX QA: generate an in-memory attendance workbook and read it back', async () => {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'VISO QA';
  const summary = workbook.addWorksheet('Resumen ejecutivo');
  summary.mergeCells('A1:D1');
  summary.getCell('A1').value = 'REPORTE OPERATIVO DE TURNOS Y ASISTENCIA';
  summary.getCell('A1').font = { bold: true };
  summary.addRow(['Colaborador', 'Turnos', 'Minutos', 'Estado']);
  summary.addRow(['QA-EMPLEADO', 2, 480, 'Cerrado']);
  summary.getCell('C3').numFmt = '#,##0';

  const details = workbook.addWorksheet('Detalle de turnos');
  details.addRow(['ID', 'Fecha', 'Entrada', 'Salida']);
  details.addRow(['QA-001', '2026-10-19', '08:00', '16:00']);

  const binary = await workbook.xlsx.writeBuffer();
  const buffer = Buffer.from(binary);
  assert.ok(buffer.byteLength > 1500, 'XLSX must contain a non-empty workbook');
  assert.equal(buffer.toString('ascii', 0, 2), 'PK', 'XLSX must be a ZIP container');

  const reopened = new ExcelJS.Workbook();
  await reopened.xlsx.load(buffer);
  assert.deepEqual(reopened.worksheets.map((sheet) => sheet.name), ['Resumen ejecutivo', 'Detalle de turnos']);
  const savedSummary = reopened.getWorksheet('Resumen ejecutivo');
  assert.equal(savedSummary.getCell('A1').value, 'REPORTE OPERATIVO DE TURNOS Y ASISTENCIA');
  assert.equal(savedSummary.getCell('A1').font.bold, true);
  assert.equal(savedSummary.getCell('A3').value, 'QA-EMPLEADO');
  assert.equal(savedSummary.getCell('B3').value, 2);
  assert.equal(savedSummary.getCell('C3').value, 480);
  assert.equal(savedSummary.getCell('D3').value, 'Cerrado');
  const savedDetails = reopened.getWorksheet('Detalle de turnos');
  assert.equal(savedDetails.getCell('A2').value, 'QA-001');
  assert.equal(savedDetails.getCell('D2').value, '16:00');
});
