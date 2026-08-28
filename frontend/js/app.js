/**
 * js/app.js
 * ADAPTED FROM ELECTRON — the vast majority of this file (mode
 * switching, Smart Paste wiring, inline validation, branding, status
 * bar) is UNCHANGED from the original, because none of it ever touched
 * Electron directly — it only ever called into js/pdf.js / js/email.js,
 * which are what actually changed transport.
 *
 * Changes from the Electron version, specifically:
 *  - handleGeneratePdf() now stores the FULL result object from
 *    MLPdf.generate() (not just a filePath) because js/email.js needs
 *    the actual PDF bytes to hand to the Local Helper.
 *  - A new "Save PDF" button triggers a browser download via
 *    MLPdf.downloadPdf().
 *  - handleSendEmail() passes the selected email template (js/templates.js)
 *    through to MLEmail.compose().
 *  - init() loads the template list and checks the Local Helper's
 *    health endpoint, neither of which existed in the desktop app.
 *  - wireLogoFallback() for the letter's inline logo was REMOVED: the
 *    header is now a single static banner image (assets/images/letter-header.png,
 *    see index.html) rather than a coded logo + text block, so there's
 *    no separate "fallback monogram" state to wire up anymore. The
 *    topbar's own small logo (topbarLogoImg) never had a fallback and
 *    still doesn't need one.
 */
(function () {
  'use strict';

  const { qs, qsa, debounce, safeTrim, restrictToDigits } = window.MLUtils;
  const { validateField, validateForm } = window.MLValidation;

  const FIELD_IDS = {
    provider: 'providerInput',
    patientName: 'patientInput',
    company: 'companyInput',
    grp: 'grpInput',
    crt: 'crtInput',
    email: 'emailInput',
    notes: 'notesInput',
  };

  const ERROR_IDS = {
    provider: 'providerError',
    patientName: 'patientError',
    company: 'companyError',
    grp: 'grpError',
    crt: 'crtError',
    email: 'emailError',
  };

  // Tracks the most recently generated PDF result (now includes the
  // actual bytes, not just a path) so Send Email / Save PDF can use it
  // without regenerating — reset whenever the form materially changes.
  let lastGeneratedPdf = null;

  /** Reads the manual entry form into a plain state object. (Unchanged.) */
  function readFormState() {
    const state = {};
    Object.keys(FIELD_IDS).forEach((key) => {
      const el = qs(`#${FIELD_IDS[key]}`);
      state[key] = el ? el.value : '';
    });
    return state;
  }

  const renderPreview = debounce((state, activeFieldId) => {
    window.MLPreview.render(state, activeFieldId);
  }, 80);

  function invalidateGeneratedPdf() {
    lastGeneratedPdf = null;
    const sendBtn = qs('#sendEmailBtn');
    const downloadBtn = qs('#downloadPdfBtn');
    if (sendBtn) {
      sendBtn.disabled = true;
      sendBtn.title = 'Generate a PDF first';
    }
    if (downloadBtn) {
      downloadBtn.disabled = true;
      downloadBtn.title = 'Generate a PDF first';
    }
  }

  function handleFormInput(event) {
    renderPreview(readFormState(), event?.target?.id || null);
    invalidateGeneratedPdf();
  }

  function handleFieldBlur(event) {
    const name = event.target.name;
    if (!ERROR_IDS[name]) return;

    const result = validateField(name, event.target.value);
    const errorEl = qs(`#${ERROR_IDS[name]}`);

    if (result.valid) {
      event.target.dataset.state = safeTrim(event.target.value) ? 'valid' : '';
      if (errorEl) errorEl.textContent = '';
    } else {
      event.target.dataset.state = 'invalid';
      if (errorEl) errorEl.textContent = result.message;
    }
  }

  function wireManualForm() {
    const form = qs('#coverLetterForm');
    if (!form) return;

    form.addEventListener('input', handleFormInput);
    qsa('.field__control', form).forEach((el) => {
      el.addEventListener('blur', handleFieldBlur);
    });

    restrictToDigits(qs('#grpInput'), 10);
    restrictToDigits(qs('#crtInput'));

    form.addEventListener('reset', () => {
      setTimeout(() => {
        qsa('.field__control', form).forEach((el) => {
          el.dataset.state = '';
        });
        qsa('.field__error', form).forEach((el) => {
          el.textContent = '';
        });
        renderPreview(readFormState());
        invalidateGeneratedPdf();
        setActionFeedback('', null);
      }, 0);
    });
  }

  function wirePasteArea() {
    const textarea = qs('#pasteArea');
    const counter = qs('#pasteCount');
    if (!textarea || !counter) return;

    textarea.addEventListener('input', () => {
      const len = textarea.value.length;
      counter.textContent = `${len} character${len === 1 ? '' : 's'}`;
    });
  }

  /** "Paste" button: reads the OS clipboard directly (Ctrl+V/right-click still work natively). (Unchanged.) */
  function wirePasteClipboardButton() {
    const btn = qs('#pasteClipboardBtn');
    const textarea = qs('#pasteArea');
    if (!btn || !textarea) return;

    btn.addEventListener('click', async () => {
      if (!navigator.clipboard || !navigator.clipboard.readText) {
        setActionFeedback('Clipboard access isn\'t available here — use Ctrl+V instead.', 'error');
        return;
      }
      try {
        const text = await navigator.clipboard.readText();
        textarea.value = text;
        textarea.dispatchEvent(new Event('input', { bubbles: true }));
        textarea.focus();
      } catch (error) {
        setActionFeedback('Could not read the clipboard — use Ctrl+V instead.', 'error');
      }
    });
  }

  /** Lets an agent drag a text selection straight onto the paste area. (Unchanged.) */
  function wireDragAndDrop() {
    const textarea = qs('#pasteArea');
    if (!textarea) return;

    ['dragenter', 'dragover'].forEach((evt) => {
      textarea.addEventListener(evt, (event) => {
        event.preventDefault();
        textarea.dataset.dragover = 'true';
      });
    });

    ['dragleave', 'dragend', 'drop'].forEach((evt) => {
      textarea.addEventListener(evt, () => {
        delete textarea.dataset.dragover;
      });
    });

    textarea.addEventListener('drop', (event) => {
      event.preventDefault();
      const text = event.dataTransfer.getData('text/plain');
      if (!text) return;
      textarea.value = text;
      textarea.dispatchEvent(new Event('input', { bubbles: true }));
    });
  }

  /** Writes parsed values into the manual-entry inputs. (Unchanged.) */
  function writeFormState(fields) {
    Object.keys(FIELD_IDS).forEach((key) => {
      const el = qs(`#${FIELD_IDS[key]}`);
      if (el && fields[key] !== undefined) el.value = fields[key];
    });
  }

  function applyValidationHighlights(state) {
    const { errors } = validateForm(state);
    Object.keys(ERROR_IDS).forEach((key) => {
      const el = qs(`#${FIELD_IDS[key]}`);
      const errorEl = qs(`#${ERROR_IDS[key]}`);
      if (!el) return;
      if (errors[key]) {
        el.dataset.state = 'invalid';
        if (errorEl) errorEl.textContent = errors[key];
      } else {
        el.dataset.state = safeTrim(el.value) ? 'valid' : '';
        if (errorEl) errorEl.textContent = '';
      }
    });
  }

  function renderParseReport(detected) {
    const list = qs('#parseReport');
    if (!list) return;

    list.textContent = '';
    window.MLParser.FIELD_DEFINITIONS.forEach((def) => {
      const ok = Boolean(detected[def.key]);
      const item = document.createElement('li');
      item.className = `parse-report__item parse-report__item--${ok ? 'ok' : 'warn'}`;
      item.textContent = `${ok ? '✔' : '⚠'} ${def.reportLabel} ${ok ? 'detected' : 'not found'}`;
      list.appendChild(item);
    });
    list.hidden = false;
  }

  function handleParse() {
    const textarea = qs('#pasteArea');
    if (!textarea) return;

    let result;
    try {
      result = window.MLParser.parse(textarea.value);
    } catch (error) {
      setActionFeedback(`Parsing failed unexpectedly: ${error.message}`, 'error');
      return;
    }

    writeFormState(result.fields);
    const state = readFormState();

    applyValidationHighlights(state);
    window.MLPreview.render(state);
    invalidateGeneratedPdf();
    renderParseReport(result.detected);
    setMode('manual');

    const missingRequired = window.MLParser.FIELD_DEFINITIONS.filter(
      (def) => def.required && !result.detected[def.key]
    );

    if (missingRequired.length > 0) {
      const names = missingRequired.map((def) => def.reportLabel).join(', ');
      setActionFeedback(`Parsed, but couldn't find: ${names}. Fill those in manually.`, 'error');
    } else {
      setActionFeedback('All fields detected — review below, then generate the PDF.', 'success');
    }
  }

  function wireParser() {
    const btn = qs('#parseBtn');
    if (btn) btn.addEventListener('click', handleParse);
  }

  function setMode(tab) {
    const tabPaste = qs('#modeTabPaste');
    const tabManual = qs('#modeTabManual');
    const panelPaste = qs('#pastePanel');
    const panelManual = qs('#manualPanel');
    const showPaste = tab === 'paste';

    tabPaste.setAttribute('aria-selected', String(showPaste));
    tabManual.setAttribute('aria-selected', String(!showPaste));
    panelPaste.hidden = !showPaste;
    panelManual.hidden = showPaste;
  }

  function wireModeSwitch() {
    qs('#modeTabPaste').addEventListener('click', () => setMode('paste'));
    qs('#modeTabManual').addEventListener('click', () => setMode('manual'));
  }

  function wireDraftBanner() {
    const banner = qs('#draftBanner');
    const dismissBtn = qs('#dismissDraftBtn');
    if (!banner || !dismissBtn) return;

    dismissBtn.addEventListener('click', () => {
      banner.hidden = true;
    });
  }

  function applyBrandingFromConfig() {
    const cfg = window.MLConfig || {};
    const app = cfg.app || {};
    const build = cfg.build || {};

    const titleEl = qs('#appTitleText');
    if (titleEl && app.applicationName) titleEl.textContent = app.applicationName;

    const badgeEl = qs('#versionBadge');
    if (badgeEl && build.version) {
      badgeEl.textContent = `v${build.version} · Web`;
    }

    if (app.applicationName) document.title = app.applicationName;
  }

  /** NEW — pings the Local Helper's /health endpoint so the agent knows upfront whether Outlook automation will work. */
  async function checkHelperStatus() {
    const badge = qs('#helperStatusBadge');
    if (!badge) return;
    try {
      await window.MLApi.getJson(window.MLApi.HELPER_BASE, '/health');
      badge.textContent = 'Helper: connected';
      badge.dataset.state = 'ok';
    } catch (error) {
      badge.textContent = 'Helper: not running';
      badge.dataset.state = 'error';
      badge.title = 'The local Outlook Helper is not reachable — Send Email will not work until it is running.';
    }
  }

  // ---- Status bar (unchanged) -----------------------------------------

  const STEP_ORDER = ['stepReady', 'stepPdf', 'stepEmail', 'stepDone'];

  function setStatus(label, tone) {
    const dot = qs('#statusDot');
    const text = qs('#statusLabel');
    if (text) text.textContent = label;
    if (dot) {
      dot.className = `statusbar__dot statusbar__dot--${tone}`;
    }
  }

  function advanceStep(stepId) {
    const targetIndex = STEP_ORDER.indexOf(stepId);
    STEP_ORDER.forEach((id, index) => {
      const el = qs(`#${id}`);
      if (!el) return;
      el.classList.remove('statusbar__step--active', 'statusbar__step--done');
      if (index < targetIndex) {
        el.classList.add('statusbar__step--done');
      } else if (index === targetIndex) {
        el.classList.add('statusbar__step--active');
      }
    });
  }

  function setActionFeedback(message, tone) {
    const el = qs('#actionFeedback');
    if (!el) return;
    el.textContent = message;
    if (tone) {
      el.dataset.tone = tone;
    } else {
      delete el.dataset.tone;
    }
  }

  function setButtonLoading(btn, isLoading) {
    if (!btn) return;
    btn.disabled = isLoading || btn.disabled;
    btn.classList.toggle('btn--loading', isLoading);
  }

  // ---- Generate PDF -----------------------------------------------------

  async function handleGeneratePdf() {
    const state = readFormState();
    const { valid, errors } = validateForm(state);

    if (!valid) {
      Object.keys(errors).forEach((name) => {
        const el = qs(`#${FIELD_IDS[name]}`);
        const errorEl = qs(`#${ERROR_IDS[name]}`);
        if (el) el.dataset.state = 'invalid';
        if (errorEl) errorEl.textContent = errors[name];
      });
      setActionFeedback('Fix the highlighted fields before generating a PDF.', 'error');
      return;
    }

    const btn = qs('#generatePdfBtn');
    setButtonLoading(btn, true);
    setStatus('Generating PDF…', 'progress');
    setActionFeedback('', null);

    try {
      const result = await window.MLPdf.generate(state);
      lastGeneratedPdf = result;

      const sendBtn = qs('#sendEmailBtn');
      const downloadBtn = qs('#downloadPdfBtn');
      if (sendBtn) {
        sendBtn.disabled = false;
        sendBtn.title = '';
      }
      if (downloadBtn) {
        downloadBtn.disabled = false;
        downloadBtn.title = '';
      }

      advanceStep('stepPdf');
      setStatus('PDF generated', 'success');
      setActionFeedback('PDF generated — download it or send it by email.', 'success');
    } catch (error) {
      setStatus('PDF generation failed', 'error');
      setActionFeedback(error.message, 'error');
    } finally {
      setButtonLoading(btn, false);
      btn.disabled = false;
    }
  }

  /** NEW — "Save PDF" button: browser-downloads the already-generated PDF bytes. */
  function handleDownloadPdf() {
    if (!lastGeneratedPdf) {
      setActionFeedback('Generate the PDF first.', 'error');
      return;
    }
    window.MLPdf.downloadPdf(lastGeneratedPdf.pdfBase64, lastGeneratedPdf.fileName);
  }

  // ---- Send Email ---------------------------------------------------------

  async function handleSendEmail() {
    const state = readFormState();
    const { valid, errors } = validateForm(state);

    if (!valid) {
      Object.keys(errors).forEach((name) => {
        const errorEl = qs(`#${ERROR_IDS[name]}`);
        if (errorEl) errorEl.textContent = errors[name];
      });
      setActionFeedback('Fix the highlighted fields before preparing the email.', 'error');
      return;
    }

    if (!lastGeneratedPdf) {
      setActionFeedback('Generate the PDF first so it can be attached.', 'error');
      return;
    }

    const btn = qs('#sendEmailBtn');
    setButtonLoading(btn, true);
    setStatus('Opening Outlook…', 'progress');
    setActionFeedback('', null);

    try {
      const selectedTemplate = window.MLTemplates.getSelectedTemplate();
      const override = window.MLTemplates.toOverride(selectedTemplate);
      await window.MLEmail.compose(state, lastGeneratedPdf, override);
      advanceStep('stepEmail');
      setStatus('Email prepared in Outlook', 'success');
      setActionFeedback(
        'Outlook opened with the cover letter attached — review and send from there.',
        'success'
      );
    } catch (error) {
      setStatus('Outlook automation failed', 'error');
      setActionFeedback(error.message, 'error');
    } finally {
      setButtonLoading(btn, false);
      btn.disabled = !lastGeneratedPdf;
    }
  }

  function wireActionButtons() {
    const pdfBtn = qs('#generatePdfBtn');
    const emailBtn = qs('#sendEmailBtn');
    const downloadBtn = qs('#downloadPdfBtn');
    if (pdfBtn) pdfBtn.addEventListener('click', handleGeneratePdf);
    if (emailBtn) emailBtn.addEventListener('click', handleSendEmail);
    if (downloadBtn) downloadBtn.addEventListener('click', handleDownloadPdf);
  }

  function init() {
    wireModeSwitch();
    wireManualForm();
    wirePasteArea();
    wirePasteClipboardButton();
    wireDragAndDrop();
    wireParser();
    wireDraftBanner();
    wireActionButtons();
    applyBrandingFromConfig();

    window.MLPreview.initZoomControls();
    window.MLPreview.render(readFormState());

    window.MLStamp.init((dateText) => {
      window.MLPreview.setStampDate(dateText);
    });

    window.MLTemplates.loadTemplates();
    checkHelperStatus();
  }

  document.addEventListener('DOMContentLoaded', init);
})();
