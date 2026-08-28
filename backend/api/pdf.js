/**
 * backend/api/pdf.js
 * REPLACES the 'pdf:generate' IPC handler that used to live in
 * main.js + electron/pdfEngine.js. Same contract, shape adjusted for
 * HTTP: takes { html, fileName }, returns the PDF as base64 plus a
 * short-lived logical reference, so the browser can both trigger a
 * download AND hand the same bytes to the Local Helper for the email
 * step, without generating the PDF twice.
 */

const express = require('express');
const renderer = require('../pdf/renderer');

const router = express.Router();

router.post('/pdf', async (req, res) => {
  const { html, fileName } = req.body || {};

  if (!html || typeof html !== 'string') {
    return res.status(400).json({ message: 'Request must include an "html" string.' });
  }

  try {
    const baseUrl = `${req.protocol}://${req.get('host')}/`;
    const { buffer, fileName: safeFileName } = await renderer.generateFromHtml({
      html,
      fileName,
      baseUrl,
    });

    res.json({
      // Logical reference only (Variant 1, browser-mediated — see
      // README.md) — the browser already holds the real bytes below
      // and hands them to the Local Helper itself, so no server-side
      // temp file needs to be tracked or cleaned up.
      filePath: `generated:${safeFileName}`,
      fileName: safeFileName,
      pdfBase64: buffer.toString('base64'),
    });
  } catch (error) {
    console.error('[api/pdf] generation failed:', error);
    res.status(500).json({
      message: "We couldn't generate the PDF. Please try again, and contact IT if this continues.",
      detail: error.message,
    });
  }
});

module.exports = router;
