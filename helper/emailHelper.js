/**
 * helper/emailHelper.js
 * PORTED FROM electron/emailEngine.js — the same module, relocated. The
 * only structural change from the original is where the PDF bytes come
 * from: the original received a filePath already sitting on disk
 * (written by the same Electron process moments earlier); this
 * receives base64 PDF bytes over HTTP from the browser and writes them
 * to its own private temp directory first (see writeTempPdf below),
 * then proceeds identically from there.
 *
 * NEW: oftPath is now accepted and forwarded to the PowerShell script's
 * -OftPath parameter (see scripts/send-outlook-email.ps1), so the real
 * company Outlook template can be opened instead of a blank mail item
 * when a template configures one.
 *
 * Everything else — the injection-safe execFile + argv[] pattern, the
 * friendly Outlook-unavailable error rewrite, and the fact that
 * send-outlook-email.ps1 still only ever calls .Display(), never
 * .Send() — is UNCHANGED.
 */

const { execFile } = require('child_process');
const path = require('path');
const fs = require('fs');
const os = require('os');
const crypto = require('crypto');

const SCRIPT_PATH = path.join(__dirname, 'scripts', 'send-outlook-email.ps1');

// Private temp directory this Helper owns exclusively — never a path
// supplied by the browser (no arbitrary file paths accepted from a
// request body).
const TEMP_DIR = path.join(os.tmpdir(), 'metlife-cover-letter-helper');

const OUTLOOK_UNAVAILABLE_RE = /Outlook\.Application|CLSID|COM class factory|REGDB_E_CLASSNOTREG/i;
const FRIENDLY_OUTLOOK_UNAVAILABLE_MESSAGE =
  "Outlook doesn't appear to be installed or set up on this machine. Install Outlook, sign in, and try again.";

/** Writes incoming base64 PDF bytes to a private, generated-name temp file. Never trusts a path from the request. */
function writeTempPdf(pdfBase64, attachmentName) {
  if (!fs.existsSync(TEMP_DIR)) {
    fs.mkdirSync(TEMP_DIR, { recursive: true });
  }
  const safeName = (attachmentName || 'Cover Letter.pdf').replace(/[\\/:*?"<>|]/g, '-');
  const uniquePrefix = crypto.randomBytes(6).toString('hex');
  const filePath = path.join(TEMP_DIR, `${uniquePrefix}-${safeName}`);
  fs.writeFileSync(filePath, Buffer.from(pdfBase64, 'base64'));
  return filePath;
}

/** Best-effort cleanup — not critical if it occasionally misses one; TEMP_DIR is OS temp and gets cleared eventually regardless. */
function cleanupTempPdf(filePath) {
  fs.unlink(filePath, () => {});
}

class EmailHelper {
  /**
   * @param {{ to: string, cc?: string, bcc?: string, subject?: string, body?: string, pdfBase64: string, attachmentName?: string, oftPath?: string }} options
   * @returns {Promise<{ status: string, stdout: string }>}
   */
  sendViaOutlook({ to, cc = '', bcc = '', subject = '', body = '', pdfBase64, attachmentName, oftPath = '' } = {}) {
    return new Promise((resolve, reject) => {
      if (!to) {
        reject(new Error('EmailHelper.sendViaOutlook requires a "to" address.'));
        return;
      }
      if (process.platform !== 'win32') {
        reject(new Error('Outlook automation is only available on Windows.'));
        return;
      }

      let attachmentPath = '';
      try {
        if (pdfBase64) {
          attachmentPath = writeTempPdf(pdfBase64, attachmentName);
        }
      } catch (writeError) {
        reject(new Error(`Could not stage the PDF attachment locally: ${writeError.message}`));
        return;
      }

      // Same argv-array pattern as the original electron/emailEngine.js
      // — every value is a discrete, isolated argument, never
      // concatenated into a shell/PowerShell command string.
      const args = [
        '-NoProfile',
        '-NonInteractive',
        '-ExecutionPolicy', 'Bypass',
        '-File', SCRIPT_PATH,
        '-To', to,
        '-Cc', cc,
        '-Bcc', bcc,
        '-Subject', subject,
        '-Body', body,
        '-Attachment', attachmentPath,
        '-OftPath', oftPath || '',
      ];

      execFile('powershell.exe', args, { windowsHide: true, timeout: 30000 }, (error, stdout, stderr) => {
        if (attachmentPath) cleanupTempPdf(attachmentPath);

        if (error) {
          const raw = (stderr || error.message || '').trim();
          const message = OUTLOOK_UNAVAILABLE_RE.test(raw)
            ? FRIENDLY_OUTLOOK_UNAVAILABLE_MESSAGE
            : `Outlook automation failed: ${raw}`;
          const rejection = new Error(message);
          rejection.detail = raw;
          reject(rejection);
          return;
        }
        resolve({ status: 'prepared', stdout: stdout.trim() });
      });
    });
  }
}

module.exports = new EmailHelper();
