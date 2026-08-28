/**
 * config/pdf-config.js
 * PDF-side configuration consumed by js/pdf.js. The attachment naming
 * ("Cover Letter - {PatientName}.pdf" / "Cover Letter.pdf") is owned by
 * config/email-config.js — the email workflow is what actually cares
 * what the file is called — and re-exposed here under different key
 * names (attachmentNameTemplate -> attachmentNameTemplate,
 * attachmentNameFallback -> fallbackAttachmentName) so js/pdf.js doesn't
 * need to know config/email-config.js exists. This is why index.html
 * loads config/email-config.js before this file.
 *
 * Deliberately does NOT contain page size, margins, or anything about
 * visual layout — that's owned by css/preview.css and
 * electron/pdfEngine.js, neither of which Milestone 5 touches.
 *
 * Exposed as window.MLConfig.pdf in the browser, { PDF_CONFIG } via Node
 * require(). See config/README.md for the full property reference.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    const { EMAIL_CONFIG } = require('./email-config');
    module.exports = { PDF_CONFIG: factory(EMAIL_CONFIG) };
  } else {
    root.MLConfig = root.MLConfig || {};
    root.MLConfig.pdf = factory(root.MLConfig.email);
  }
})(typeof window !== 'undefined' ? window : global, function (emailConfig) {
  'use strict';

  return {
    /** Same template js/email.js uses for the Outlook attachment's display name. */
    attachmentNameTemplate: emailConfig.attachmentNameTemplate,

    /** Same fallback js/email.js uses when Patient Name is blank. */
    fallbackAttachmentName: emailConfig.attachmentNameFallback,
  };
});
