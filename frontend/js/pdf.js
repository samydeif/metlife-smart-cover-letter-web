/**
 * js/pdf.js
 * ADAPTED FROM ELECTRON — the original renderer-side client called
 * window.electronAPI.generatePdf(...) over Electron's IPC bridge. The
 * ONLY thing that changed here is the transport: this now POSTs to the
 * backend's /api/pdf route (backend/api/pdf.js), which runs the exact
 * same "wrap the letter HTML, render it with a real Chromium engine,
 * return A4 PDF bytes" logic that electron/pdfEngine.js used to do
 * in-process — just server-side now, via Playwright (see
 * backend/pdf/renderer.js).
 *
 * buildFileName() is copied verbatim — the attachment filename
 * convention still lives in config/pdf-config.js and is untouched.
 */
(function (global) {
  'use strict';

  function getConfig() {
    const cfg = global.MLConfig && global.MLConfig.pdf;
    if (!cfg) {
      throw new Error(
        'PDF_CONFIG is missing — make sure config/pdf-config.js is loaded before js/pdf.js.'
      );
    }
    return cfg;
  }

  /**
   * Builds "Cover Letter - {PatientName}.pdf" from the config template,
   * or the configured fallback name if there's no patient name yet.
   * (Unchanged from the Electron version.)
   */
  function buildFileName(state) {
    const cfg = getConfig();
    const patientName = (state.patientName || '').trim();
    if (!patientName) return cfg.fallbackAttachmentName;
    return cfg.attachmentNameTemplate.replace('{PatientName}', patientName);
  }

  /**
   * Generates a PDF from the live preview for the given form state.
   * @param {object} state - current manual-entry form values
   * @returns {Promise<{ filePath: string, pdfBase64: string, fileName: string }>}
   *   filePath is a backend-side logical reference (used by js/email.js
   *   when asking the Helper to attach it); pdfBase64 is the actual PDF
   *   bytes, used by the "Save PDF" button to trigger a browser download.
   */
  async function generate(state) {
    const html = global.MLPreview.getLetterHtml();
    if (!html) {
      throw new Error('Nothing to generate yet — fill in the cover letter fields first.');
    }

    const result = await global.MLApi.postJson(global.MLApi.BACKEND_BASE, '/api/pdf', {
      html,
      fileName: buildFileName(state),
    });

    if (!result || !result.filePath) {
      throw new Error('PDF generation did not return a file reference.');
    }

    return result;
  }

  /** Triggers a browser download of the base64 PDF bytes returned by generate(). */
  function downloadPdf(pdfBase64, fileName) {
    const byteChars = atob(pdfBase64);
    const byteNumbers = new Array(byteChars.length);
    for (let i = 0; i < byteChars.length; i++) byteNumbers[i] = byteChars.charCodeAt(i);
    const blob = new Blob([new Uint8Array(byteNumbers)], { type: 'application/pdf' });

    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = fileName;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  global.MLPdf = { generate, buildFileName, downloadPdf };
})(window);
