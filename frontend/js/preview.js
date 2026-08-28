/**
 * preview.js
 * Renders the live A4 preview from the current form state, and is the
 * single source of truth for the cover letter markup: js/pdf.js pulls
 * its HTML from here (getLetterHtml) rather than re-building it, so the
 * on-screen preview and the generated PDF can never drift apart.
 *
 * Every dynamic value is written via .textContent (never innerHTML) so
 * user-entered text can never be interpreted as markup — this app has a
 * documented history of a stored-XSS bug from an innerHTML shortcut and
 * we do not repeat it here.
 */
(function (global) {
  'use strict';

  const { qs } = global.MLUtils;

  const ZOOM_MIN = 40;
  const ZOOM_MAX = 150;
  const ZOOM_STEP = 10;
  const STAGE_PADDING = 96; // must track --sp-6 * 2 (preview-stage padding) + a little breathing room

  let zoom = 100;
  let els = null;
  let resizeObserver = null;

  function cacheElements() {
    els = {
      empty: qs('#previewEmpty'),
      content: qs('#coverLetterContent'),
      stage: qs('#previewStage'),
      paper: qs('#paper'),
      provider: qs('#previewProvider'),
      patient: qs('#previewPatient'),
      company: qs('#previewCompany'),
      grp: qs('#previewGrp'),
      crt: qs('#previewCrt'),
      notes: qs('#previewNotes'),
      stampDate: qs('#previewStampDate'),
      zoomValue: qs('#zoomValue'),
      zoomInBtn: qs('#zoomInBtn'),
      zoomOutBtn: qs('#zoomOutBtn'),
      fitBtn: qs('#fitZoomBtn'),
    };
  }

  /** True once the agent has entered at least one meaningful field. */
  function hasAnyContent(state) {
    return Boolean(
      state.provider || state.patientName || state.company ||
      state.grp || state.crt || state.email || state.notes
    );
  }

  function setTextOrPlaceholder(el, value, placeholder) {
    const trimmed = (value || '').trim();
    if (trimmed) {
      el.textContent = trimmed;
      el.classList.remove('cl-line--placeholder');
    } else {
      el.textContent = placeholder;
      el.classList.add('cl-line--placeholder');
    }
  }

  /**
   * Repaints the preview from a form-state object:
   * { provider, patientName, company, grp, crt, email, notes }
   * The empty state is swapped out the instant any field has a value,
   * and restored the instant the form goes fully blank again (e.g. Clear).
   */
  function render(state, activeFieldId) {
    if (!els) cacheElements();

    const show = hasAnyContent(state);
    els.empty.hidden = show;
    els.content.hidden = !show;
    if (!show) return;

    setTextOrPlaceholder(els.provider, state.provider, '—');
    setTextOrPlaceholder(els.patient, state.patientName, '—');
    setTextOrPlaceholder(els.company, state.company, '—');
    setTextOrPlaceholder(els.grp, state.grp, '—');
    setTextOrPlaceholder(els.crt, state.crt, '—');
    setTextOrPlaceholder(
      els.notes,
      state.notes,
      
    );
      ensureActiveFieldVisible(activeFieldId);
  }

  function ensureActiveFieldVisible(activeFieldId) {
  if (!activeFieldId || !els.stage) return;

  const previewTargets = {
    providerInput: els.provider,
    patientInput: els.patient,
    companyInput: els.company,
    grpInput: els.grp,
    crtInput: els.crt,
    notesInput: els.notes,
  };

  const target = previewTargets[activeFieldId];
  if (!target || target.hidden) return;

  const stageRect = els.stage.getBoundingClientRect();
  const targetRect = target.getBoundingClientRect();

  const topMargin = 24;
  const bottomMargin = 24;

  const targetAbove = targetRect.top < stageRect.top + topMargin;
  const targetBelow = targetRect.bottom > stageRect.bottom - bottomMargin;

  if (!targetAbove && !targetBelow) return;

  const targetCenter =
    targetRect.top + (targetRect.height / 2);

  const stageCenter =
    stageRect.top + (stageRect.height / 2);

  const delta = targetCenter - stageCenter;

  els.stage.scrollBy({
    top: delta,
    behavior: 'smooth',
  });
}

  function setStampDate(text) {
    if (!els) cacheElements();
    els.stampDate.textContent = text;
  }

  /**
   * Serializes the current letter content as standalone HTML, stripped of
   * the empty state and any zoom scaling, for js/pdf.js to hand to the
   * Electron main process. This is the ONE place letter markup is read
   * from, so the PDF always matches what the agent is looking at.
   */
  function getLetterHtml() {
    if (!els) cacheElements();
   const clone = els.paper.cloneNode(true);

/*
 * Convert local image paths to absolute file URLs before sending
 * the HTML to Electron PDF engine.
 * This is required because the PDF engine renders the HTML from
 * a temporary file, so relative paths like assets/images/logo.png
 * would otherwise point to the Temp folder.
 */
clone.querySelectorAll('img').forEach((img) => {
  const src = img.getAttribute('src');

  if (!src) return;

  if (
    src.startsWith('data:') ||
    src.startsWith('file:') ||
    /^[a-z][a-z0-9+.-]*:/i.test(src)
  ) {
    return;
  }

  try {
    img.setAttribute('src', new URL(src, document.baseURI).href);
  } catch (error) {
    console.warn('Could not resolve image path for PDF:', src, error);
  }
});

const emptyEl = clone.querySelector('#previewEmpty');
    if (emptyEl) emptyEl.remove();

    const contentEl = clone.querySelector('#coverLetterContent');
    if (contentEl) contentEl.hidden = false;

    clone.style.zoom = '';
    clone.style.boxShadow = 'none';
    clone.style.margin = '0';

    return clone.outerHTML;
  }

  /** Applies the current zoom level via CSS `zoom` (layout-aware, unlike transform). */
  function applyZoom() {
    els.paper.style.zoom = zoom / 100;
    els.zoomValue.textContent = `${zoom}%`;
    updateFitState();
  }

  /** Marks the stage as "fits" so it can center the paper vertically too. */
  function updateFitState() {
    if (!els.stage) return;
    const fits = els.paper.scrollHeight * (zoom / 100) <= els.stage.clientHeight;
    els.stage.dataset.fits = String(fits);
  }

  function zoomIn() {
    zoom = Math.min(ZOOM_MAX, zoom + ZOOM_STEP);
    applyZoom();
  }

  function zoomOut() {
    zoom = Math.max(ZOOM_MIN, zoom - ZOOM_STEP);
    applyZoom();
  }

  /** Computes the zoom level that fits the paper's width inside the stage. */
  function computeFitZoom() {
    if (!els.stage) return 100;
    const available = els.stage.clientWidth - STAGE_PADDING;
    const paperWidth = els.paper.offsetWidth / (zoom / 100) || 794;
    const fitPercent = Math.floor((available / paperWidth) * 100);
    return Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, fitPercent));
  }

  function fitToWidth() {
    zoom = computeFitZoom();
    applyZoom();
  }

  function initZoomControls() {
    if (!els) cacheElements();
    els.zoomInBtn.addEventListener('click', zoomIn);
    els.zoomOutBtn.addEventListener('click', zoomOut);
    els.fitBtn.addEventListener('click', fitToWidth);

    // Fit on first paint, and re-fit if the window/panels are resized —
    // this is what keeps the preview scroll-free at typical window sizes.
    fitToWidth();
    if ('ResizeObserver' in window) {
      resizeObserver = new ResizeObserver(global.MLUtils.debounce(fitToWidth, 150));
      resizeObserver.observe(els.stage);
    } else {
      window.addEventListener('resize', global.MLUtils.debounce(fitToWidth, 150));
    }
  }

  global.MLPreview = {
    render,
    setStampDate,
    getLetterHtml,
    initZoomControls,
  };
})(window);
