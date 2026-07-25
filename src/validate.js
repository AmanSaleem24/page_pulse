/**
 * validate.js
 *
 * URL validation helper. Returns a result object rather than throwing so
 * callers can handle errors in a structured way.
 */

'use strict';

/**
 * Validates that a string is a well-formed http/https URL.
 *
 * @param {unknown} input - The raw value to validate
 * @returns {{ valid: true, url: URL } | { valid: false, error: string }}
 */
function validateUrl(input) {
  if (typeof input !== 'string' || input.trim() === '') {
    return { valid: false, error: 'URL is required and must be a non-empty string.' };
  }

  let parsed;
  try {
    parsed = new URL(input.trim());
  } catch {
    return { valid: false, error: `"${input}" is not a valid URL. Make sure it is well-formed (e.g. https://example.com).` };
  }

  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    return {
      valid: false,
      error: `Only http and https URLs are supported. Received protocol: "${parsed.protocol}".`,
    };
  }

  return { valid: true, url: parsed };
}

module.exports = { validateUrl };
