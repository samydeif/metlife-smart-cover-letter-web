/**
 * config/email-config.js
 * The Configuration Layer for the email workflow — pure data, no
 * functions. Every business string (recipients, subject/body wording,
 * attachment naming) lives here and ONLY here; js/email.js (the
 * Business Rules layer) reads this object and fills the templates in;
 * electron/emailEngine.js (the Outlook engine) never reads this file at
 * all — it just receives whatever strings js/email.js hands it. That
 * three-way split is the point of this milestone: Configuration,
 * Business Rules, and the Outlook Engine stay independent layers.
 *
 * Exposed as window.MLConfig.email in the browser, { EMAIL_CONFIG } via
 * Node require() (consumed by config/pdf-config.js so the attachment
 * naming isn't duplicated — see that file). See config/README.md for
 * the full property reference and "how do I change X" instructions.
 */
(function (root, factory) {
  const EMAIL_CONFIG = factory();
  if (typeof module === 'object' && module.exports) {
    module.exports = { EMAIL_CONFIG };
  } else {
    root.MLConfig = root.MLConfig || {};
    root.MLConfig.email = EMAIL_CONFIG;
  }
})(typeof window !== 'undefined' ? window : global, function () {
  'use strict';

  return {
    /**
     * Always CC'd on every cover-letter email — the agent never types
     * this. See "How to change the default CC" in config/README.md.
     */
    defaultCc: 'EgyptMedicalIndividualCallCenter@metlife.com',

    /** Left empty per the brief — change here if that ever needs to differ. */
    defaultBcc: '',

    /** Used in the subject when Patient Name is blank. */
    fallbackCustomerName: 'Customer',

    /** Used in the body when Provider is blank. */
    fallbackProviderName: 'Your Healthcare Provider',

    /**
     * Documented for forward-compatibility, but NOT wired to actually
     * switch engine behavior: electron/emailEngine.js only ever calls
     * Outlook's .Display(), unconditionally. The brief's "Never call
     * .Send()" reads as an absolute rule, not a togglable setting, so
     * this property is intentionally inert today rather than a live
     * switch that could accidentally be flipped to 'send'. If a future
     * milestone genuinely needs a send-immediately mode, that should be
     * a deliberate, explicitly-approved change to the engine itself —
     * not a side effect of editing this config value.
     */
    displayMode: 'display',

    /**
     * {PatientName} → Patient Name, or fallbackCustomerName if blank.
     * {CRT} → CRT number; if CRT is blank the ENTIRE " | CRT {CRT}"
     * segment is removed rather than left as a dangling placeholder.
     * See js/email.js#buildSubject for the resolution logic.
     */
    subjectTemplate: 'MetLife Egypt | Cover Letter | {PatientName} | CRT {CRT}',

    /**
     * {Provider} → Provider, or fallbackProviderName if blank. Line
     * breaks are significant and preserved exactly as written here. See
     * js/email.js#buildBody for the resolution logic.
     */
    bodyTemplate: [
      'Dear Valued Customer,',
      '',
      'Greetings from MetLife Egypt.',
      '',
      'Please find attached your Cover Letter for your requested medical service.',
      '',
      'Kindly present the attached Cover Letter to:',
      '',
      '{Provider}',
      '',
      'If you require any further assistance, please contact MetLife Customer Service.',
      '',
      'Kind Regards,',
      '',
      'Claims Department',
      'MetLife Egypt',
    ].join('\n'),

    /**
     * {PatientName} → Patient Name. Falls back to attachmentNameFallback
     * if blank. Re-exposed under config/pdf-config.js's window.MLConfig.pdf
     * for js/pdf.js to consume, rather than duplicated there.
     */
    attachmentNameTemplate: 'Cover Letter - {PatientName}.pdf',
    attachmentNameFallback: 'Cover Letter.pdf',

    /**
     * Per-business-line overrides, keyed by business line. Each value is
     * shallow-merged over the defaults above by js/email.js#resolveConfig
     * — an empty object means "inherit everything." See "How to add a
     * future Business Line" in config/README.md.
     */
    businessLines: {
      medical: {},
      // dental: { defaultCc: '...', subjectTemplate: '...' },
      // optical: { ... },
      // pharmacy: { ... },
      // corporate: { ... },
    },
  };
});
