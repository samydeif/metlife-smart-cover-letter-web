/**
 * stamp.js
 * Owns the "CLAIMS DEPARTMENT / date / METLIFE EGYPT" stamp.
 * The date is always today — never manually editable — and refreshes
 * itself automatically if the app is left open across midnight.
 */
(function (global) {
  'use strict';

  let onChangeCallback = null;
  let midnightTimer = null;

  function currentStampText() {
    return global.MLUtils.formatStampDate(new Date());
  }

  function scheduleMidnightRefresh() {
    clearTimeout(midnightTimer);
    const now = new Date();
    const nextMidnight = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, 0, 0, 5);
    const msUntilMidnight = nextMidnight.getTime() - now.getTime();

    midnightTimer = setTimeout(() => {
      if (typeof onChangeCallback === 'function') {
        onChangeCallback(currentStampText());
      }
      scheduleMidnightRefresh(); // re-arm for the following day
    }, msUntilMidnight);
  }

  /**
   * Starts the stamp clock. Calls `callback(dateText)` immediately once,
   * then again automatically every time the calendar date rolls over.
   */
  function init(callback) {
    onChangeCallback = callback;
    if (typeof onChangeCallback === 'function') {
      onChangeCallback(currentStampText());
    }
    scheduleMidnightRefresh();
  }

  global.MLStamp = {
    init,
    currentStampText,
  };
})(window);
