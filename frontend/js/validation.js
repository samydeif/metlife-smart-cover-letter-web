/**
 * validation.js
 * Field-level validation rules for the manual entry form.
 *
 * Gates both the inline field styling AND the Generate PDF / Send Email
 * actions in js/app.js — nothing gets handed to js/pdf.js or js/email.js
 * without passing validateForm() first.
 */
(function (global) {
  'use strict';

  const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  const GRP_RE = /^\d{1,10}$/;   // Group policy number: digits only, 10-digit cap
  const CRT_RE = /^\d{1,15}$/;   // Certificate number: digits only, unbounded in the UI

  /**
   * Validates a single field by name.
   * @returns {{valid: boolean, message: string}}
   */
  function validateField(name, rawValue) {
    const value = global.MLUtils.safeTrim(rawValue);

    switch (name) {
      case 'provider':
        return value.length > 0
          ? { valid: true, message: '' }
          : { valid: false, message: 'Provider is required.' };

      case 'patientName':
        return value.length > 0
          ? { valid: true, message: '' }
          : { valid: false, message: 'Patient name is required.' };

      case 'company':
        return value.length > 0
          ? { valid: true, message: '' }
          : { valid: false, message: 'Company is required.' };

      case 'grp':
        if (value.length === 0) return { valid: false, message: 'Group policy number is required.' };
        return GRP_RE.test(value)
          ? { valid: true, message: '' }
          : { valid: false, message: 'GRP must be digits only (max 10).' };

      case 'crt':
        if (value.length === 0) return { valid: false, message: 'Certificate number is required.' };
        return CRT_RE.test(value)
          ? { valid: true, message: '' }
          : { valid: false, message: 'CRT must be digits only.' };

      case 'email':
        if (value.length === 0) return { valid: false, message: 'Customer email is required.' };
        return EMAIL_RE.test(value)
          ? { valid: true, message: '' }
          : { valid: false, message: 'Enter a valid email address.' };

      default:
        return { valid: true, message: '' };
    }
  }

  /**
   * Validates the full form state object at once.
   * @param {object} formState - { provider, patientName, company, grp, crt, email, notes }
   * @returns {{ valid: boolean, errors: Object<string,string> }}
   */
  function validateForm(formState) {
    const fields = ['provider', 'patientName', 'company', 'grp', 'crt', 'email'];
    const errors = {};
    let valid = true;

    fields.forEach((name) => {
      const result = validateField(name, formState[name]);
      if (!result.valid) {
        errors[name] = result.message;
        valid = false;
      }
    });

    return { valid, errors };
  }

  global.MLValidation = {
    validateField,
    validateForm,
  };
})(window);
