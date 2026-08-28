/**
 * js/templates.js
 * NEW FILE — the Electron app had exactly one hardcoded email template
 * (config/email-config.js), so there was nothing to select. The web
 * version adds a template dropdown fed by the backend's /api/templates
 * route, which in turn is either read from the company Excel file
 * (backend/excel/reader.js) or falls back to the single default
 * template from config/email-config.js if no Excel source is
 * configured yet.
 *
 * Selecting a template does not change how buildSubject()/buildBody()
 * work (js/email.js) — it just supplies an override object that gets
 * shallow-merged over the base config, exactly like the original app's
 * (unused) businessLines mechanism already supported. It can now also
 * carry an oftPath, forwarded through to the Local Helper.
 */
(function (global) {
  'use strict';

  const { qs } = global.MLUtils;

  let templates = [];

  function populateSelect(list) {
    const select = qs('#templateSelect');
    if (!select) return;

    select.innerHTML = '';
    if (!list.length) {
      const opt = document.createElement('option');
      opt.value = '';
      opt.textContent = 'Default (no templates configured)';
      select.appendChild(opt);
      return;
    }

    list.forEach((tpl) => {
      const opt = document.createElement('option');
      opt.value = tpl.id;
      opt.textContent = tpl.name;
      select.appendChild(opt);
    });
  }

  function getSelectedTemplate() {
    const select = qs('#templateSelect');
    if (!select || !select.value) return null;
    return templates.find((t) => t.id === select.value) || null;
  }

  /** Converts a backend template record into the same shape js/email.js's businessLines override expects. */
  function toOverride(tpl) {
    if (!tpl) return null;
    const override = {};
    if (tpl.subjectTemplate) override.subjectTemplate = tpl.subjectTemplate;
    if (tpl.bodyTemplate) override.bodyTemplate = tpl.bodyTemplate;
    if (tpl.cc) override.defaultCc = tpl.cc;
    if (tpl.bcc) override.defaultBcc = tpl.bcc;
    if (tpl.oftPath) override.oftPath = tpl.oftPath;
    return override;
  }

  async function loadTemplates() {
    const select = qs('#templateSelect');
    try {
      const result = await global.MLApi.getJson(global.MLApi.BACKEND_BASE, '/api/templates');
      templates = (result && result.templates) || [];
      populateSelect(templates);
    } catch (error) {
      // Non-fatal: the app still works with the single default template
      // from config/email-config.js if the Excel source is unavailable.
      if (select) {
        select.innerHTML = '<option value="">Default (templates unavailable)</option>';
      }
      console.warn('Could not load email templates:', error.message);
    }
  }

  global.MLTemplates = { loadTemplates, getSelectedTemplate, toOverride };
})(window);
