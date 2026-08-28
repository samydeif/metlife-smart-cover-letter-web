/**
 * js/api.js
 * NEW FILE — did not exist in the Electron app, since there was no
 * network boundary to cross there (window.electronAPI + IPC handled
 * everything). This is the web equivalent: a small, shared fetch()
 * wrapper used by js/pdf.js, js/email.js, and js/templates.js so none
 * of them duplicate error handling / base-URL logic.
 *
 * BACKEND_BASE / HELPER_BASE are both same-origin-relative by default
 * (the backend serves this frontend itself), and HELPER_BASE points at
 * the Local Windows Helper running on the agent's own machine — see
 * README.md "Architecture" section for why these are two different
 * services.
 */
(function (global) {
  'use strict';

  const BACKEND_BASE = ''; // same origin — backend serves this frontend
  const HELPER_BASE = (global.MLConfig && global.MLConfig.app && global.MLConfig.app.helperUrl)
    || 'http://127.0.0.1:5175';
  const HELPER_TOKEN = (global.MLConfig && global.MLConfig.app && global.MLConfig.app.helperAuthToken)
    || '';

  async function parseJsonSafely(response) {
    const text = await response.text();
    if (!text) return null;
    try {
      return JSON.parse(text);
    } catch (error) {
      return null;
    }
  }

  async function request(base, path, options) {
    let response;
    try {
      response = await fetch(base + path, options);
    } catch (networkError) {
      const err = new Error(
        base === HELPER_BASE
          ? "Couldn't reach the local Outlook Helper. Make sure it's running on this computer, then try again."
          : "Couldn't reach the server. Check your connection and try again."
      );
      err.cause = networkError;
      throw err;
    }

    const body = await parseJsonSafely(response);

    if (!response.ok) {
      const message = (body && body.message) || `Request failed (${response.status}).`;
      const err = new Error(message);
      err.status = response.status;
      err.detail = body && body.detail;
      throw err;
    }

    return body;
  }

  function postJson(base, path, payload) {
    const headers = { 'Content-Type': 'application/json' };
    if (base === HELPER_BASE && HELPER_TOKEN) {
      headers['X-Helper-Token'] = HELPER_TOKEN;
    }
    return request(base, path, {
      method: 'POST',
      headers,
      body: JSON.stringify(payload),
    });
  }

  function getJson(base, path) {
    return request(base, path, { method: 'GET' });
  }

  global.MLApi = {
    BACKEND_BASE,
    HELPER_BASE,
    postJson,
    getJson,
    request,
  };
})(window);
