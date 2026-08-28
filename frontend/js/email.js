/**
 * js/email.js
 * ADAPTED FROM ELECTRON — buildSubject()/buildBody() are copied
 * VERBATIM from the original (same {PatientName}/{CRT}/{Provider}
 * substitution rules, same "drop the whole CRT segment if blank" fix).
 * Nothing about what an email SAYS has changed.
 *
 * What changed is only how the prepared email reaches Outlook: the
 * original called window.electronAPI.sendEmail(...) over Electron's IPC
 * bridge into electron/emailEngine.js. The web version instead POSTs
 * directly to the Local Windows Helper at 127.0.0.1 (see README.md's
 * architecture section for why). The Helper then runs the SAME
 * send-outlook-email.ps1 script, the SAME injection-safe way
 * (execFile + argv array), ending at the same $mail.Display() — never
 * .Send(). See helper/emailHelper.js.
 *
 * oftPath support (NEW): if the resolved template config carries an
 * oftPath (set from the Excel-derived template — see
 * backend/excel/reader.js), it's forwarded to the Helper, which opens
 * that real Outlook template via CreateItemFromTemplate() instead of a
 * blank mail item — see helper/scripts/send-outlook-email.ps1.
 */
(function (global) {
  'use strict';

  /** Reads EMAIL_CONFIG, failing loudly if the config script wasn't loaded. (Unchanged.) */
  function getBaseConfig() {
    const cfg = global.MLConfig && global.MLConfig.email;
    if (!cfg) {
      throw new Error(
        'EMAIL_CONFIG is missing — make sure config/email-config.js is loaded before js/email.js.'
      );
    }
    return cfg;
  }

  /**
   * Resolves the effective config for an optional business line/template
   * override: the base EMAIL_CONFIG, shallow-merged with a template's
   * override fields if one was selected (see js/templates.js). Mirrors
   * the original businessLines merge exactly, just keyed by the
   * Excel-derived template id instead of a hardcoded businessLineKey.
   */
  function resolveConfig(overrideKeyOrObject) {
    const base = getBaseConfig();
    let override = null;
    if (typeof overrideKeyOrObject === 'string') {
      override = base.businessLines && base.businessLines[overrideKeyOrObject];
    } else if (overrideKeyOrObject && typeof overrideKeyOrObject === 'object') {
      override = overrideKeyOrObject;
    }
    return override ? Object.assign({}, base, override) : base;
  }

  /** Builds the subject line. VERBATIM logic from the Electron version. */
  function buildSubject(state, overrideKeyOrObject) {
    const cfg = resolveConfig(overrideKeyOrObject);
    const patientName = (state.patientName || '').trim() || cfg.fallbackCustomerName;

    let subject = cfg.subjectTemplate.replace('{PatientName}', patientName);

    const crt = (state.crt || '').trim();
    if (crt) {
      subject = subject.replace('{CRT}', crt);
    } else {
      // No CRT: drop the whole " | CRT {CRT}" segment instead of
      // rendering an empty placeholder.
      subject = subject.replace(/\s*\|\s*CRT\s*\{CRT\}/, '');
    }

    return subject;
  }

  /** Builds the body. VERBATIM logic from the Electron version. */
  function buildBody(state, overrideKeyOrObject) {
    const cfg = resolveConfig(overrideKeyOrObject);
    const provider = (state.provider || '').trim() || cfg.fallbackProviderName;
    return cfg.bodyTemplate.replace('{Provider}', provider);
  }

  /**
   * Prepares (opens, filled in, attached) an Outlook email for the agent
   * to review and send. Never auto-sends — helper/emailHelper.js only
   * ever calls Outlook's .Display(), exactly like the original
   * electron/emailEngine.js did. The agent always makes the final call.
   *
   * @param {object} state - current manual-entry form values
   * @param {{ filePath: string, pdfBase64: string, fileName: string }} pdfResult - MLPdf.generate()'s return value
   * @param {string|object} [templateOverride] - selected template id or its override object (js/templates.js)
   */
  async function compose(state, pdfResult, templateOverride) {
    if (!state.email) {
      throw new Error('Add a customer email before preparing the message.');
    }
    if (!pdfResult || !pdfResult.pdfBase64) {
      throw new Error('Generate the PDF before preparing the email.');
    }

    const cfg = resolveConfig(templateOverride);

    return global.MLApi.postJson(global.MLApi.HELPER_BASE, '/email', {
      to: state.email,
      cc: cfg.defaultCc,
      bcc: cfg.defaultBcc,
      subject: buildSubject(state, templateOverride),
      body: buildBody(state, templateOverride),
      pdfBase64: pdfResult.pdfBase64,
      attachmentName: pdfResult.fileName,
      // NEW — forwarded to the Helper. If empty/absent, the Helper's
      // PowerShell script falls back to a blank CreateItem(0), exactly
      // today's behavior. See send-outlook-email.ps1's $OftPath param.
      oftPath: cfg.oftPath || '',
    });
  }

  global.MLEmail = { compose, buildSubject, buildBody, resolveConfig };
})(window);
