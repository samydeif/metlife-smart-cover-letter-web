/**
 * backend/excel/reader.js
 * Implements a generic, adaptable Excel reader that extracts a
 * structured template list from the company's .xlsx workflow file.
 *
 * The real network location has now been confirmed (see
 * backend/.env.example and README.md):
 *   Excel folder: \\Egcai1metfsp01\clmcsc\Official Complains\OnePlace
 *   OFT template: \\Egcai1metfsp01\clmcsc\Official Complains\OnePlace\Reff\Coverage letter.oft
 * The exact Excel FILENAME inside that folder still needs to be
 * confirmed and set as EXCEL_TEMPLATE_PATH (full path including the
 * .xlsx filename) — see .env.example.
 *
 * EXPECTED_COLUMNS below is still a best-guess layout until the real
 * file's column headers are confirmed — update it to match once known.
 * Everything else (caching, the API shape, fallback behavior) does not
 * need to change.
 *
 * Mode A (snapshot + manual refresh) is implemented: call
 * refreshFromExcel() once at startup (see server.js) and again from an
 * admin action if you add one — NOT on every request, since a shared
 * network .xlsx isn't meant for high-frequency concurrent reads.
 */

const fs = require('fs');
let ExcelJS;
try {
  ExcelJS = require('exceljs');
} catch (e) {
  ExcelJS = null; // handled gracefully below — see readTemplatesFromFile()
}

const { EMAIL_CONFIG } = require('../../frontend/config/email-config.js');

// Set in backend/.env — see .env.example for the confirmed network
// folder and the one remaining placeholder (the actual .xlsx filename).
const EXCEL_PATH = process.env.EXCEL_TEMPLATE_PATH || '';

// Confirmed working (tested against the real network share) — see
// README.md's "Confirmed network paths" section. Used as the fallback
// oftPath for the default template when no Excel-derived value exists.
const DEFAULT_OFT_PATH = process.env.OFT_TEMPLATE_PATH || '';

// Expected column headers on the first sheet, row 1. ADJUST THESE to
// match the real file once confirmed — this is the ONE place that
// needs to change for that.
const EXPECTED_COLUMNS = {
  id: 'ID',
  name: 'Template Name',
  oftPath: 'OFT Path',
  subjectTemplate: 'Subject',
  bodyTemplate: 'Body',
  to: 'To',
  cc: 'CC',
  bcc: 'BCC',
  attachmentRequired: 'Attachment Required',
};
// -------------------------------------------------------------------

let cachedTemplates = null;
let lastRefreshError = null;

/** The single default template, derived from the original app's only config — always available even with zero Excel setup. */
function defaultTemplate() {
  return [
    {
      id: 'default',
      name: 'Coverage Letter (default)',
      oftPath: DEFAULT_OFT_PATH || null,
      subjectTemplate: EMAIL_CONFIG.subjectTemplate,
      bodyTemplate: EMAIL_CONFIG.bodyTemplate,
      cc: EMAIL_CONFIG.defaultCc,
      bcc: EMAIL_CONFIG.defaultBcc,
      attachmentRequired: true,
    },
  ];
}

/** Reads and parses the configured Excel file. Returns null (not throws) if unavailable — callers decide what to do with that. */
async function readTemplatesFromFile() {
  if (!EXCEL_PATH) return null;
  if (!ExcelJS) {
    lastRefreshError = "The 'exceljs' package isn't installed — run npm install in /backend.";
    return null;
  }
  if (!fs.existsSync(EXCEL_PATH)) {
    lastRefreshError = `Excel file not found at ${EXCEL_PATH}. Check EXCEL_TEMPLATE_PATH and network-share permissions.`;
    return null;
  }

  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile(EXCEL_PATH);
  const sheet = workbook.worksheets[0];
  if (!sheet) {
    lastRefreshError = 'The Excel file has no worksheets.';
    return null;
  }

  const headerRow = sheet.getRow(1);
  const colIndex = {};
  headerRow.eachCell((cell, colNumber) => {
    const value = String(cell.value || '').trim();
    Object.keys(EXPECTED_COLUMNS).forEach((key) => {
      if (EXPECTED_COLUMNS[key] === value) colIndex[key] = colNumber;
    });
  });

  const missing = Object.keys(EXPECTED_COLUMNS).filter((k) => !colIndex[k]);
  if (missing.length) {
    lastRefreshError = `Excel column headers don't match EXPECTED_COLUMNS — missing: ${missing.join(
      ', '
    )}. Update backend/excel/reader.js's EXPECTED_COLUMNS to match the real file.`;
    return null;
  }

  const templates = [];
  sheet.eachRow((row, rowNumber) => {
    if (rowNumber === 1) return; // header
    const get = (key) => {
      const cell = row.getCell(colIndex[key]);
      return cell && cell.value != null ? String(cell.value).trim() : '';
    };
    const id = get('id');
    if (!id) return; // skip blank rows

    templates.push({
      id,
      name: get('name') || id,
      oftPath: get('oftPath') || null,
      subjectTemplate: get('subjectTemplate') || EMAIL_CONFIG.subjectTemplate,
      bodyTemplate: get('bodyTemplate') || EMAIL_CONFIG.bodyTemplate,
      cc: get('cc') || EMAIL_CONFIG.defaultCc,
      bcc: get('bcc') || EMAIL_CONFIG.defaultBcc,
      attachmentRequired: /^(true|yes|1)$/i.test(get('attachmentRequired') || 'true'),
    });
  });

  lastRefreshError = null;
  return templates.length ? templates : null;
}

/** Mode A: read once (or on manual refresh), cache in memory. Call this at server startup. */
async function refreshFromExcel() {
  const fromExcel = await readTemplatesFromFile();
  cachedTemplates = fromExcel || defaultTemplate();
  return { templates: cachedTemplates, source: fromExcel ? 'excel' : 'default', error: lastRefreshError };
}

/** Fast, synchronous-feeling read for the /api/templates route — never touches the network share directly (no per-request Excel I/O). */
function getTemplates() {
  if (!cachedTemplates) return defaultTemplate();
  return cachedTemplates;
}

function getLastRefreshError() {
  return lastRefreshError;
}

module.exports = { refreshFromExcel, getTemplates, getLastRefreshError, defaultTemplate };
