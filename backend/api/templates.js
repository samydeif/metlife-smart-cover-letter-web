/**
 * backend/api/templates.js
 * Serves the Excel-derived (or default-fallback) template list to the
 * frontend's js/templates.js. Read-only — never touches the Excel file
 * itself per-request (backend/excel/reader.js caches it, Mode A).
 */

const express = require('express');
const excelReader = require('../excel/reader');

const router = express.Router();

router.get('/templates', (req, res) => {
  const templates = excelReader.getTemplates().map((t) => ({
    id: t.id,
    name: t.name,
    oftPath: t.oftPath,
    subjectTemplate: t.subjectTemplate,
    bodyTemplate: t.bodyTemplate,
    cc: t.cc,
    bcc: t.bcc,
  }));

  res.json({
    templates,
    source: excelReader.getLastRefreshError() ? 'default' : undefined,
  });
});

/** Admin-style manual refresh endpoint (Mode A's "refresh from Excel" action). Not wired to any UI button yet — call it directly (e.g. curl -X POST) after updating the Excel file. */
router.post('/templates/refresh', async (req, res) => {
  try {
    const result = await excelReader.refreshFromExcel();
    res.json(result);
  } catch (error) {
    res.status(500).json({ message: 'Refresh failed.', detail: error.message });
  }
});

module.exports = router;
