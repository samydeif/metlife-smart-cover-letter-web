/**
 * config/app-config.js
 * Application-wide, non-business settings: the kind of thing that would
 * otherwise end up as scattered magic strings across index.html and
 * js/*.js. This is the single source of truth for applicationName —
 * config/build-info.js deliberately does NOT redefine it, so the name
 * lives in exactly one place. Self-contained: doesn't depend on any
 * other config file.
 *
 * Exposed as window.MLConfig.app in the browser (consumed by
 * js/app.js#applyBrandingFromConfig for the topbar title/document
 * title), { APP_CONFIG } via Node require(). See config/README.md for
 * the full property reference.
 */
(function (root, factory) {
  const APP_CONFIG = factory();
  if (typeof module === 'object' && module.exports) {
    module.exports = { APP_CONFIG };
  } else {
    root.MLConfig = root.MLConfig || {};
    root.MLConfig.app = APP_CONFIG;
  }
})(typeof window !== 'undefined' ? window : global, function () {
  'use strict';

  return {
    /** The single source of truth for the app's display name — see header comment. */
    applicationName: 'MetLife Smart Cover Letter',

    /** The company this internal tool belongs to — not a business-line name. */
    companyName: 'MetLife Egypt',

    /** ISO 639-1 code. Not yet consumed by the UI — the Preview module is out of scope this milestone. */
    defaultLanguage: 'ar',

    /** Percent. Not yet consumed by js/preview.js — Milestone 5 does not touch the Preview module. */
    defaultZoomPercent: 100,

    /** 'light' | 'dark'. Reserved — the app only ships a light theme today. */
    theme: 'light',

    /**
     * Toggles for capabilities that exist in the codebase but aren't
     * fully wired up yet. Reading a flag here instead of sprinkling
     * ad-hoc booleans through the code is what makes it a "feature flag"
     * rather than a TODO comment.
     */
    featureFlags: {
      smartPaste: true,
      autosaveDraft: false,
      recentProvidersAutocomplete: false,
    },
  };
});
