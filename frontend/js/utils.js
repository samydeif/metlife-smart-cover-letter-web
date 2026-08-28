/**
 * utils.js
 * Small, dependency-free helpers shared by every other module.
 * Exposed on window.MLUtils so plain <script> tags can consume it
 * without a bundler (per the project's "no build step" constraint).
 */
(function (global) {
  'use strict';

  /** Shorthand querySelector scoped to a root (defaults to document). */
  function qs(selector, root) {
    return (root || document).querySelector(selector);
  }

  /** Shorthand querySelectorAll returning a real array. */
  function qsa(selector, root) {
    return Array.from((root || document).querySelectorAll(selector));
  }

  /**
   * Debounce: delays invoking `fn` until `wait` ms have passed since the
   * last call. Used to avoid re-rendering the preview on every single
   * keystroke burst during fast typing.
   */
  function debounce(fn, wait) {
    let timer = null;
    return function debounced(...args) {
      clearTimeout(timer);
      timer = setTimeout(() => fn.apply(this, args), wait);
    };
  }

  /**
   * Escapes text before it is ever written into innerHTML.
   * Every dynamic string that reaches the preview MUST pass through this
   * first — the app previously shipped a stored-XSS bug from skipping it.
   */
  function escapeHtml(value) {
    if (value === null || value === undefined) return '';
    return String(value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  /** Returns a trimmed string, or '' for null/undefined. */
  function safeTrim(value) {
    return (value === null || value === undefined) ? '' : String(value).trim();
  }

  /** Formats a Date as "DD Mon YYYY" to match the physical claims stamp. */
  function formatStampDate(date) {
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
      'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const d = date.getDate().toString().padStart(2, '0');
    const m = months[date.getMonth()];
    const y = date.getFullYear();
    return `${d} ${m} ${y}`;
  }

  /**
   * Restricts a text/number input to digits only, in place, optionally
   * capped at `maxLength`. Wired up from js/app.js for GRP (max 10) and
   * CRT (unbounded) so pasted or typed non-digit characters never stick.
   */
  function restrictToDigits(inputEl, maxLength) {
    if (!inputEl) return;
    inputEl.addEventListener('input', () => {
      let digitsOnly = inputEl.value.replace(/\D+/g, '');
      if (maxLength) digitsOnly = digitsOnly.slice(0, maxLength);
      if (digitsOnly !== inputEl.value) inputEl.value = digitsOnly;
    });
  }

  /** Turns a free-text value into a filesystem-safe filename fragment. */
  function slugify(value) {
    return safeTrim(value)
      .replace(/[^\p{L}\p{N}]+/gu, '-')
      .replace(/^-+|-+$/g, '')
      || 'untitled';
  }

  /** Very small pub/sub used to decouple app.js from preview.js. */
  function createEmitter() {
    const listeners = new Map();
    return {
      on(event, handler) {
        if (!listeners.has(event)) listeners.set(event, new Set());
        listeners.get(event).add(handler);
        return () => listeners.get(event).delete(handler);
      },
      emit(event, payload) {
        if (!listeners.has(event)) return;
        listeners.get(event).forEach((handler) => handler(payload));
      },
    };
  }

  global.MLUtils = {
    qs,
    qsa,
    debounce,
    escapeHtml,
    safeTrim,
    formatStampDate,
    restrictToDigits,
    slugify,
    createEmitter,
  };
})(window);
