/**
 * backend/pdf/renderer.js
 * PORTED FROM electron/pdfEngine.js — a line-for-line port of the
 * original's approach, with ONE substitution: Electron's offscreen
 * BrowserWindow + printToPDF() becomes Playwright's headless Chromium +
 * page.pdf(). Same rendering engine family, same options — so PDF
 * fidelity vs. the original app is preserved by construction.
 *
 * ============================================================
 * TWO BUGS WERE FOUND AND FIXED HERE DURING TESTING — READ THIS
 * ============================================================
 * Both were in how CSS gets loaded into the generated PDF's document,
 * and both were invisible in this project's own Linux-sandbox testing
 * (only surfaced on the real Windows deployment):
 *
 *   BUG 1 — malformed file:// URL on Windows. Manually building
 *   "file://" + a Windows path (e.g. "C:/Users/...") produces
 *   "file://C:/Users/..." — missing a slash (correct form is
 *   "file:///C:/...", three slashes). This happened to still work on
 *   POSIX paths (which already start with "/"), which is exactly why
 *   it wasn't caught testing in this Linux sandbox.
 *
 *   BUG 2 — even with a correctly-formed file:// URL (fixed with
 *   Node's pathToFileURL()), Chromium still refused to load it: pages
 *   loaded via page.setContent() get a non-file:// origin (effectively
 *   about:blank), and Chromium blocks loading local file:// stylesheets
 *   from a document with that origin — a security restriction, not a
 *   formatting bug, with no URL-level workaround.
 *
 * THE FIX: don't use file:// at all. This backend already serves
 * frontend/css/*.css over plain HTTP (server.js's
 * express.static(FRONTEND_DIR)), so the print document's <link> tags
 * point at that same HTTP origin instead — identical to how the letter
 * images already load (see js/preview.js#getLetterHtml, which rewrites
 * image src to absolute HTTP URLs for the same reason). Loading CSS/img
 * over HTTP is unaffected by the file:// origin restriction above,
 * because it isn't a local-file access at all from Chromium's
 * perspective — it's an ordinary cross-origin-safe HTTP request, the
 * same as any website loading its own stylesheet.
 */

const { chromium } = require('playwright');

const CSS_FILES = ['fonts.css', 'variables.css', 'style.css', 'preview.css'];

// Characters Windows won't allow in a filename. Same list as the
// original pdfEngine.js — everything else (spaces, hyphens, Arabic
// text) passes through untouched.
const INVALID_FILENAME_CHARS = /[\\/:*?"<>|]/g;
const DEFAULT_FILENAME = 'Cover Letter.pdf';

/** Turns a requested name into a safe, guaranteed-.pdf filename. (Verbatim logic from pdfEngine.js.) */
function toSafeFileName(requested) {
  const cleaned = (requested || DEFAULT_FILENAME).replace(INVALID_FILENAME_CHARS, '-').trim();
  const name = cleaned || DEFAULT_FILENAME;
  return name.toLowerCase().endsWith('.pdf') ? name : `${name}.pdf`;
}

/**
 * Wraps captured letter HTML in a standalone print document.
 *
 * IMPORTANT (carried over verbatim from the original's doc comment):
 * this uses <html lang="en"> — NOT dir="rtl" — to exactly match
 * index.html's root, which also has no dir attribute (defaults ltr).
 * The letter's Arabic sections (.cl-body) already carry their own
 * explicit `direction: rtl` in preview.css, so Arabic text still
 * renders correctly either way. But the header/footer are now single
 * full-width images (see index.html/preview.css), so they have no
 * direction-sensitive layout left to break — this fix matters most for
 * anything added back as coded text in the future.
 */
function buildPrintDocument(letterHtml, baseUrl) {
  const origin = baseUrl.endsWith('/') ? baseUrl : `${baseUrl}/`;
  const cssLinks = CSS_FILES.map(
    (name) => `<link rel="stylesheet" href="${origin}css/${name}">`
  ).join('\n    ');

  const printFixes = `
  <style>
    html, body { margin: 0; background: #ffffff; }
    .paper { box-shadow: none !important; margin: 0 !important; }
  </style>
`;

  return `
<html lang="en">
<head>
  <meta charset="UTF-8">
  <base href="${origin}">
  ${cssLinks}
  ${printFixes}
</head>
<body>
  ${letterHtml}
</body>
</html>`;
}

class PdfRenderer {
  constructor() {
    this._browserPromise = null;
  }

  /** Lazily launches one shared Chromium instance, reused across requests (same "one engine instance" pattern the original singleton used). */
  async _getBrowser() {
    if (!this._browserPromise) {
      this._browserPromise = chromium.launch({ headless: true });
    }
    return this._browserPromise;
  }

  /**
   * @param {{ html: string, fileName?: string, baseUrl: string }} options
   *   baseUrl is this backend's own origin (e.g. http://localhost:4000/),
   *   used both for the <base> tag and to build the CSS <link> URLs —
   *   see this file's header comment for exactly why HTTP, not file://.
   * @returns {Promise<{ buffer: Buffer, fileName: string }>}
   */
  async generateFromHtml({ html, fileName, baseUrl } = {}) {
    if (!html || typeof html !== 'string') {
      throw new Error('PdfRenderer.generateFromHtml requires an "html" string.');
    }

    const browser = await this._getBrowser();
    const page = await browser.newPage();

    try {
      const doc = buildPrintDocument(html, baseUrl || 'http://localhost/');
      await page.setContent(doc, { waitUntil: 'networkidle' });

      // Give self-hosted @font-face declarations a chance to finish
      // loading even on a slow first request (font-display: swap
      // already keeps text visible in the meantime — this just avoids
      // occasionally printing before the swap has happened).
      await page.evaluate(() => document.fonts && document.fonts.ready).catch(() => {});

      const buffer = await page.pdf({
        format: 'A4',
        printBackground: true,
        margin: { top: '0', bottom: '0', left: '0', right: '0' },
      });

      return { buffer, fileName: toSafeFileName(fileName) };
    } finally {
      await page.close();
    }
  }

  async close() {
    if (this._browserPromise) {
      const browser = await this._browserPromise;
      await browser.close();
      this._browserPromise = null;
    }
  }
}

// Exported as a singleton, mirroring the original pdfEngine.js.
module.exports = new PdfRenderer();
