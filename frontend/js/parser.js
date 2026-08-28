/**
 * parser.js
 * Smart Paste parser (Milestone 4).
 *
 * Turns ONE large block of text — copied wholesale from the internal
 * GRP/CRT lookup system — into structured cover-letter fields, so the
 * agent never manually retypes anything.
 *
 * DESIGN
 * ------
 * Field detection is entirely label-driven and config-based (see
 * FIELD_DEFINITIONS below): each field lists the labels it can appear
 * under, in English and Arabic. Adding a new field or a new label
 * synonym is a one-line change to that array — nothing else in this
 * file needs to know about it. There is exactly ONE place a label is
 * turned into a regular expression (buildLabelRegex) and exactly ONE
 * place a line is matched against every field (the loop in parse()), so
 * there is no per-field duplicated regex or duplicated parsing logic.
 *
 * ALGORITHM
 * ---------
 * 1. Normalize the raw text: Unicode NFKC, unify line endings, and
 *    convert tabs to spaces.
 * 2. Walk the text line by line. A line that starts with a known label
 *    followed by a colon ("Provider : X", "GRP: X", "رقم الوثيقة
 *    الجماعي : X" …) opens that field and captures whatever follows the
 *    colon as its value.
 * 3. Lines that do NOT match a label are ignored — UNLESS the most
 *    recently opened field was Notes, in which case the line is treated
 *    as a continuation (Notes is the one field expected to wrap across
 *    multiple lines). This keeps unrelated text from ever leaking into
 *    Provider/Patient/GRP/etc. while still letting long notes flow
 *    naturally across several lines.
 * 4. GRP/CRT get Arabic-Indic digits normalized to ASCII and every
 *    non-digit character stripped (GRP is additionally capped at 10
 *    digits, matching the manual-entry field's own limit).
 * 5. Email gets one more chance if no labeled line matched: the whole
 *    normalized text is scanned for anything that looks like an email
 *    address. This is the one deliberate "regex fallback" the brief
 *    asks for — it's scoped to email specifically because an email
 *    pattern is unambiguous, unlike a bare run of digits which could be
 *    almost any field.
 *
 * A blank/empty input, or input with no recognizable labels at all,
 * never throws — parse() always returns a fully-shaped result with
 * every field defaulted to '' and a warning listed for each one, so the
 * caller can show a friendly report instead of crashing.
 */
(function (global) {
  'use strict';

  const { safeTrim } = global.MLUtils;

  // ---- Field configuration -------------------------------------------
  // The single source of truth for what the parser looks for. Add a
  // field, or a label synonym for an existing field, by editing this
  // array only.
  const FIELD_DEFINITIONS = [
    {
      key: 'provider',
      reportLabel: 'Provider',
      required: true,
      labels: ['Provider', 'Hospital', 'مقدم الخدمة', 'اسم مقدم الخدمة', 'اسم المستشفى'],
    },
    {
      key: 'patientName',
      reportLabel: 'Patient',
      required: true,
      labels: ['Patient Name', 'Patient', 'اسم المريض', 'المريض'],
    },
    {
      key: 'company',
      reportLabel: 'Company',
      required: true,
      labels: ['Company', 'الشركة', 'شركة التأمين'],
    },
    {
      key: 'grp',
      reportLabel: 'GRP',
      required: true,
      labels: ['GRP', 'Group Policy', 'Group', 'رقم الوثيقة الجماعي', 'رقم الوثيقه الجماعي'],
      clean: (value) => normalizeDigits(value).replace(/\D+/g, '').slice(0, 10),
    },
    {
      key: 'crt',
      reportLabel: 'CRT',
      required: true,
      labels: ['CRT', 'Certificate', 'رقم الوثيقة الفردى', 'رقم الوثيقه الفرديه', 'رقم العضوية'],
      clean: (value) => normalizeDigits(value).replace(/\D+/g, ''),
    },
    {
      key: 'email',
      reportLabel: 'Email',
      required: true,
      labels: ['Customer Email', 'Email', 'البريد الالكتروني', 'الايميل'],
    },
    {
      key: 'notes',
      reportLabel: 'Notes',
      required: false,
      labels: ['Notes', 'Note', 'ملحوظة هامة', 'ملاحظات', 'ملحوظة'],
      allowContinuation: true, // the only field long enough to wrap across lines
    },
  ];

  const EMAIL_FALLBACK_RE = /[^\s@]+@[^\s@]+\.[^\s@]+/;

  // ---- Small, single-purpose text helpers ------------------------------

  function escapeRegex(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

  function normalizeLineEndings(text) {
    return text.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  }

  /** Converts Arabic-Indic (٠-٩) and Extended Arabic-Indic (۰-۹) digits to ASCII. */
  function normalizeDigits(value) {
    const arabicIndic = '٠١٢٣٤٥٦٧٨٩';
    const extendedArabicIndic = '۰۱۲۳۴۵۶۷۸۹';
    return String(value || '').replace(/[٠-٩۰-۹]/g, (ch) => {
      const i = arabicIndic.indexOf(ch);
      if (i !== -1) return String(i);
      const j = extendedArabicIndic.indexOf(ch);
      return j !== -1 ? String(j) : ch;
    });
  }

  /** Collapses runs of spaces/tabs to one space and trims the ends. */
  function collapseSpaces(value) {
    return String(value || '').replace(/[ \t]+/g, ' ').trim();
  }

  /**
   * Builds the one regex a field needs: optional leading bullet/dash,
   * then any of its labels (longest first, so "Group" can't shadow
   * "Group Policy"), then a colon (ASCII or fullwidth), then the value.
   */
  function buildLabelRegex(labels) {
    const alternation = labels
      .slice()
      .sort((a, b) => b.length - a.length)
      .map(escapeRegex)
      .join('|');
    return new RegExp(`^[\\s\\-•▪]*(?:${alternation})\\s*[:：]\\s*(.*)$`, 'i');
  }

  // ---- Parser -----------------------------------------------------------

  /**
   * @param {string} rawText - the block of text pasted from the internal system
   * @returns {{
   *   fields: Object<string,string>,
   *   detected: Object<string,boolean>,
   *   warnings: string[]
   * }}
   */
  function parse(rawText) {
    const compiled = FIELD_DEFINITIONS.map((def) => ({
      ...def,
      regex: buildLabelRegex(def.labels),
    }));

    const fields = {};
    const detected = {};
    compiled.forEach((def) => {
      fields[def.key] = '';
      detected[def.key] = false;
    });

    const text = safeTrim(rawText);
    if (!text) {
      return {
        fields,
        detected,
        warnings: compiled.map((def) => `${def.reportLabel} not found`),
      };
    }

    const normalized = normalizeLineEndings(text.normalize('NFKC'));
    const lines = normalized.split('\n');

    let currentKey = null;

    lines.forEach((rawLine) => {
      const line = rawLine.replace(/\t/g, ' ');
      if (!line.trim()) return; // tolerate blank lines: just skip them, don't reset state

      let matched = false;

      for (const def of compiled) {
        const m = def.regex.exec(line);
        if (m) {
          currentKey = def.key;
          fields[currentKey] = collapseSpaces(m[1]);
          detected[currentKey] = Boolean(fields[currentKey]);
          matched = true;
          break;
        }
      }

      if (!matched) {
        const openField = compiled.find((def) => def.key === currentKey);
        if (openField && openField.allowContinuation) {
          const extra = collapseSpaces(line);
          if (extra) {
            fields[currentKey] = fields[currentKey] ? `${fields[currentKey]} ${extra}` : extra;
            detected[currentKey] = true;
          }
        }
        // Any other unmatched line is unrelated text — ignored, per spec.
      }
    });

    // Field-specific cleanup (currently just GRP/CRT digit normalization).
    compiled.forEach((def) => {
      if (def.clean && fields[def.key]) {
        fields[def.key] = def.clean(fields[def.key]);
        detected[def.key] = Boolean(fields[def.key]);
      }
    });

    // Email fallback: only kicks in if no labeled line was found for it.
    if (!detected.email) {
      const match = normalized.match(EMAIL_FALLBACK_RE);
      if (match) {
        fields.email = match[0];
        detected.email = true;
      }
    }

    const warnings = compiled
      .filter((def) => !detected[def.key])
      .map((def) => `${def.reportLabel} not found`);

    return { fields, detected, warnings };
  }

  global.MLParser = {
    parse,
    FIELD_DEFINITIONS, // exposed read-only for the parse-report UI in app.js
  };
})(window);
