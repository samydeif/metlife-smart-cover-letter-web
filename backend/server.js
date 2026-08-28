/**
 * backend/server.js
 * REPLACES main.js + preload.js's role of "the privileged process the
 * renderer talks to" — except this one talks HTTP, not Electron IPC,
 * and it does NOT touch PowerShell/Outlook COM at all (that stays on
 * the agent's own machine — see /helper). This process only ever does:
 *   - serve the frontend's static files
 *   - generate PDFs server-side (backend/pdf/renderer.js, Playwright)
 *   - resolve email templates (backend/excel/reader.js)
 *
 * Intended to run on an internal server (IIS/Azure App Service/internal
 * Windows Server — see README.md's deployment section), reachable only
 * from inside the corporate network.
 */

require('dotenv').config(); // loads backend/.env — see .env.example for EXCEL_TEMPLATE_PATH / OFT_TEMPLATE_PATH

const express = require('express');
const cors = require('cors');
const path = require('path');

const pdfRoutes = require('./api/pdf');
const templateRoutes = require('./api/templates');
const excelReader = require('./excel/reader');
const renderer = require('./pdf/renderer');

const PORT = process.env.PORT || 4000;
const FRONTEND_DIR = path.join(__dirname, '..', 'frontend');

const app = express();

// Same-origin by default (frontend is served by this same process), but
// CORS is enabled defensively in case the frontend is ever split onto
// its own host during development.
app.use(cors());
app.use(express.json({ limit: '15mb' })); // PDF payloads pass through as base64 in responses, not requests, but headroom is cheap

// ---- Static frontend -----------------------------------------------------
// IMPORTANT: this is what makes backend/pdf/renderer.js's HTTP-based CSS
// loading work at all — it's the same static server that serves the
// browser's own copy of these files. See renderer.js's header comment
// for the full story of why this replaced a file:// approach.
app.use(express.static(FRONTEND_DIR));

// ---- API routes ------------------------------------------------------------
app.use('/api', pdfRoutes);
app.use('/api', templateRoutes);

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', service: 'metlife-cover-letter-backend' });
});

// ---- Fallback: serve index.html for any other GET (simple SPA-style catch-all) ----
app.get('*', (req, res, next) => {
  if (req.path.startsWith('/api/')) return next();
  res.sendFile(path.join(FRONTEND_DIR, 'index.html'));
});

// ---- Error handler ---------------------------------------------------------
app.use((err, req, res, next) => {
  console.error('[server] unhandled error:', err);
  res.status(500).json({ message: 'The service is temporarily unavailable. Please try again shortly.' });
});

async function start() {
  // Mode A: read the Excel template source once at startup (see
  // backend/excel/reader.js's header comment for why not per-request).
  const excelResult = await excelReader.refreshFromExcel();
  if (excelResult.source === 'default') {
    console.warn(
      '[server] Using default email template (Excel source not configured or unavailable):',
      excelResult.error || '(no EXCEL_TEMPLATE_PATH set)'
    );
  } else {
    console.log(`[server] Loaded ${excelResult.templates.length} email template(s) from Excel.`);
  }

  app.listen(PORT, () => {
    console.log(`MetLife Smart Cover Letter backend listening on http://localhost:${PORT}`);
  });
}

process.on('SIGINT', async () => {
  await renderer.close();
  process.exit(0);
});
process.on('SIGTERM', async () => {
  await renderer.close();
  process.exit(0);
});

start();
