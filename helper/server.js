/**
 * helper/server.js
 * The Local Windows Helper's HTTP surface. Binds to 127.0.0.1 ONLY
 * (never 0.0.0.0), so it is unreachable from any other machine on the
 * network by construction — see README.md's security section.
 *
 * This is the ONLY part of the entire web migration that still touches
 * PowerShell / Outlook COM — everything else (frontend, backend) is
 * fully sandboxed/browser-safe.
 */

require('dotenv').config(); // loads helper/.env — see .env.example

const express = require('express');
const emailHelper = require('./emailHelper');

const PORT = process.env.HELPER_PORT || 5175;

// Simple shared-secret check: the frontend reads this same value from
// its own config (see README.md's "Helper auth token" section) and
// sends it as a header. This is intentionally simple — the primary
// protection is the 127.0.0.1 bind itself; the token is defense in
// depth against another local process probing the port.
const AUTH_TOKEN = process.env.HELPER_AUTH_TOKEN || 'change-me-in-production';
const ALLOWED_ORIGINS = (process.env.HELPER_ALLOWED_ORIGINS || 'http://localhost:4000,http://127.0.0.1:4000').split(',');

const app = express();
app.use(express.json({ limit: '15mb' }));

// ---- Security middleware ---------------------------------------------------
app.use((req, res, next) => {
  const origin = req.get('Origin');
  if (origin && !ALLOWED_ORIGINS.includes(origin)) {
    return res.status(403).json({ message: 'Origin not allowed.' });
  }
  next();
});

function requireToken(req, res, next) {
  const provided = req.get('X-Helper-Token');
  if (provided !== AUTH_TOKEN) {
    return res.status(401).json({ message: 'Missing or invalid Helper token.' });
  }
  next();
}

// ---- Routes -----------------------------------------------------------------

/** Health check — used by the frontend's "Helper: connected / not running" badge. No token required so the UI can check status before the agent does anything sensitive. */
app.get('/health', (req, res) => {
  res.json({ status: 'ok', platform: process.platform });
});

/**
 * REPLACES the 'email:send' IPC handler from the Electron app.
 * Same contract, adjusted for HTTP + base64 PDF transport, plus the
 * new optional oftPath (see emailHelper.js's header comment).
 */
app.post('/email', requireToken, async (req, res) => {
  const { to, cc, bcc, subject, body, pdfBase64, attachmentName, oftPath } = req.body || {};

  if (!to) {
    return res.status(400).json({ message: 'Missing "to" address.' });
  }

  try {
    const result = await emailHelper.sendViaOutlook({ to, cc, bcc, subject, body, pdfBase64, attachmentName, oftPath });
    res.json(result);
  } catch (error) {
    console.error('[helper] sendViaOutlook failed:', error.message);
    res.status(500).json({ message: error.message, detail: error.detail });
  }
});

app.listen(PORT, '127.0.0.1', () => {
  console.log(`MetLife Cover Letter Outlook Helper listening on http://127.0.0.1:${PORT} (loopback only)`);
  if (AUTH_TOKEN === 'change-me-in-production') {
    console.warn('[helper] WARNING: using the default HELPER_AUTH_TOKEN. Set a real one via environment variable before deploying to agents.');
  }
});
