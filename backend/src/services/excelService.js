// services/excelService.js — generates .xlsx budget report using ExcelJS
const ExcelJS = require('exceljs');

/**
 * Generate a wedding budget Excel workbook buffer.
 * @param {object} payload — { items, summary, meta, actuals? }
 * @returns {Buffer}
 */
async function generateBudgetXLSX({ items = [], summary = {}, meta = {}, actuals = [] }) {
  const wb = new ExcelJS.Workbook();
  wb.creator = 'WeddingBudget.ai';
  wb.created = new Date();

  // ── Sheet 1: Budget Estimate ───────────────────────────────────────────────
  const ws = wb.addWorksheet('Budget Estimate', {
    pageSetup: { paperSize: 9, orientation: 'portrait', fitToPage: true },
  });

  // Colours
  const MAROON  = '6B1E3A';
  const GOLD    = 'C4973D';
  const CREAM   = 'FBF5E6';
  const LIGHT   = 'F5ECD6';

  // Column widths
  ws.columns = [
    { key: 'cat',  width: 28 },
    { key: 'sub',  width: 30 },
    { key: 'min',  width: 18 },
    { key: 'max',  width: 18 },
    { key: 'mid',  width: 18 },
    { key: 'pct',  width: 10 },
  ];

  // Title block
  ws.mergeCells('A1:F1');
  const title = ws.getCell('A1');
  title.value = 'WeddingBudget.ai — Estimate Report';
  title.font  = { name: 'Georgia', size: 16, bold: true, color: { argb: 'FF' + MAROON } };
  title.alignment = { horizontal: 'center' };
  ws.getRow(1).height = 28;

  ws.mergeCells('A2:F2');
  const sub = ws.getCell('A2');
  sub.value = `${meta.city ?? ''} · ${meta.hotelLabel ?? ''} · ${meta.guests ?? 0} Guests · Generated ${new Date().toLocaleDateString('en-IN')}`;
  sub.font  = { name: 'Calibri', size: 10, color: { argb: 'FF888888' } };
  sub.alignment = { horizontal: 'center' };
  ws.getRow(2).height = 16;

  // Summary row
  ws.addRow([]);
  const sumRow = ws.addRow(['', 'Conservative', `₹${Number(summary.conservative ?? 0).toLocaleString('en-IN')}`, 'Expected', `₹${Number(summary.expected ?? 0).toLocaleString('en-IN')}`, `Luxury: ₹${Number(summary.luxury ?? 0).toLocaleString('en-IN')}`]);
  sumRow.eachCell(cell => {
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF' + MAROON } };
    cell.font = { name: 'Calibri', bold: true, color: { argb: 'FF' + GOLD } };
    cell.alignment = { horizontal: 'center', vertical: 'middle' };
  });
  ws.getRow(4).height = 22;

  ws.addRow([]);

  // Header row
  const hdr = ws.addRow(['Cost Head', 'Detail', 'Min (₹)', 'Max (₹)', 'Mid (₹)', '% of Total']);
  hdr.eachCell(cell => {
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF' + LIGHT } };
    cell.font = { name: 'Calibri', bold: true, size: 10, color: { argb: 'FF' + MAROON } };
    cell.border = { bottom: { style: 'medium', color: { argb: 'FF' + MAROON } } };
    cell.alignment = { horizontal: 'center' };
  });
  hdr.getCell(1).alignment = { horizontal: 'left' };
  hdr.getCell(2).alignment = { horizontal: 'left' };
  ws.getRow(6).height = 18;

  // Data rows
  items.forEach((item, i) => {
    const r = ws.addRow([
      item.cat, item.sub ?? '',
      item.min ?? 0, item.max ?? 0, item.mid ?? 0,
      `${item.pct ?? 0}%`,
    ]);
    const bg = i % 2 === 0 ? 'FFFFFFFF' : 'FF' + CREAM;
    r.eachCell(cell => {
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: bg } };
      cell.font = { name: 'Calibri', size: 10 };
      cell.alignment = { vertical: 'middle' };
    });
    // Number format for cost columns
    ['C','D','E'].forEach(col => {
      const cell = r.getCell(col);
      cell.numFmt = '₹#,##0';
      cell.alignment = { horizontal: 'right' };
    });
    r.getCell('F').alignment = { horizontal: 'center' };
    r.height = 18;
  });

  // Total row
  const totalRow = ws.addRow(['TOTAL', '', summary.conservative ?? 0, summary.luxury ?? 0, summary.expected ?? 0, '100%']);
  totalRow.eachCell(cell => {
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF' + MAROON } };
    cell.font = { name: 'Calibri', bold: true, color: { argb: 'FF' + GOLD } };
    cell.alignment = { horizontal: 'center', vertical: 'middle' };
  });
  totalRow.getCell(1).alignment = { horizontal: 'left' };
  ['C','D','E'].forEach(col => { totalRow.getCell(col).numFmt = '₹#,##0'; });
  totalRow.height = 20;

  // ── Sheet 2: Actuals Tracker (if any) ─────────────────────────────────────
  if (actuals.length > 0) {
    const ws2 = wb.addWorksheet('Actuals Tracker');
    ws2.columns = [
      { key: 'cost_head',      width: 16 },
      { key: 'label',          width: 28 },
      { key: 'est_min',        width: 16 },
      { key: 'est_max',        width: 16 },
      { key: 'actual',         width: 16 },
      { key: 'vendor',         width: 22 },
      { key: 'variance',       width: 16 },
    ];

    const h2 = ws2.addRow(['Cost Head', 'Line Item', 'Est. Min (₹)', 'Est. Max (₹)', 'Actual (₹)', 'Vendor', 'Variance (₹)']);
    h2.eachCell(cell => {
      cell.fill = { type:'pattern', pattern:'solid', fgColor: { argb: 'FF' + MAROON } };
      cell.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    });

    actuals.forEach(a => {
      const variance = a.actual_amount != null && a.estimated_min != null
        ? a.actual_amount - Math.round((a.estimated_min + (a.estimated_max ?? a.estimated_min)) / 2)
        : null;
      const r = ws2.addRow([
        a.cost_head, a.line_item_label,
        a.estimated_min ?? '', a.estimated_max ?? '',
        a.actual_amount ?? '',
        a.vendor_name ?? '',
        variance ?? '',
      ]);
      if (variance != null) {
        r.getCell(7).font = { color: { argb: variance > 0 ? 'FFDC2626' : 'FF15803D' } };
      }
      ['C','D','E','G'].forEach(col => {
        const cell = r.getCell(col);
        if (cell.value !== '') cell.numFmt = '₹#,##0';
      });
    });
  }

  // ── Sheet 3: Meta ─────────────────────────────────────────────────────────
  const ws3 = wb.addWorksheet('Report Info');
  [
    ['Generated by', 'WeddingBudget.ai'],
    ['Date', new Date().toLocaleDateString('en-IN')],
    ['City', meta.city ?? '—'],
    ['Hotel Tier', meta.hotelLabel ?? '—'],
    ['Guests', meta.guests ?? '—'],
    ['Rooms', meta.rooms ?? '—'],
    ['City Multiplier', meta.cityMultiplier ?? '—'],
    ['Note', 'All estimates are indicative ranges. Actual costs depend on vendor negotiations, season and availability.'],
  ].forEach(([k, v]) => {
    const r = ws3.addRow([k, v]);
    r.getCell(1).font = { bold: true };
  });
  ws3.getColumn(1).width = 20;
  ws3.getColumn(2).width = 60;

  return wb.xlsx.writeBuffer();
}

module.exports = { generateBudgetXLSX };
