/**
 * config/build-info.js
 * Version/build metadata — the kind of thing that changes on every
 * release (bump the version, bump the build number) independently of
 * app-config.js's actual settings. Self-contained: nothing else in
 * config/ needs to load before this file, which is why index.html loads
 * it first.
 *
 * Exposed as window.MLConfig.build in the browser, { BUILD_INFO } via
 * Node require(). See config/README.md for the full property reference.
 */
(function (root, factory) {
  const BUILD_INFO = factory();
  if (typeof module === 'object' && module.exports) {
    module.exports = { BUILD_INFO };
  } else {
    root.MLConfig = root.MLConfig || {};
    root.MLConfig.build = BUILD_INFO;
  }
})(typeof window !== 'undefined' ? window : global, function () {
  'use strict';

  return {
    /** Bump on every release. Semantic versioning (MAJOR.MINOR.PATCH). */
    version: '0.5.0',

    /** Free-form build identifier — date-based here, swap for a CI build number if one exists. */
    buildNumber: '2026.08.07-1',

    /** 'development' | 'staging' | 'production'. Display-only for now — drives no behavior. */
    environment: 'development',
  };
});
