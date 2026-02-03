// Utility functions for LinkedOut
// Extracted for testability

/**
 * Sanitize text to remove orphaned Unicode surrogates that break JSON.stringify
 * @param {string} text - Input text
 * @returns {string} - Sanitized text with orphaned surrogates replaced
 */
export function sanitizeText(text) {
  if (!text) return '';
  // Remove orphaned high surrogates (not followed by low surrogate)
  // and orphaned low surrogates (not preceded by high surrogate)
  return text
    .replace(/[\uD800-\uDBFF](?![\uDC00-\uDFFF])/g, '\uFFFD')
    .replace(/(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/g, '\uFFFD');
}

/**
 * Generate a simple hash from a string
 * @param {string} str - Input string
 * @returns {string} - Hash as base36 string
 */
export function simpleHash(str) {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) - hash + str.charCodeAt(i)) | 0;
  }
  return Math.abs(hash).toString(36);
}

/**
 * Escape HTML special characters to prevent XSS
 * @param {string} string - Input string
 * @returns {string} - HTML-escaped string
 */
export function escapeHtml(string) {
  if (!string) return '';
  const div = typeof document !== 'undefined' ? document.createElement('div') : null;
  if (div) {
    div.textContent = string;
    return div.innerHTML;
  }
  // Fallback for non-browser environments (testing)
  return string
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * Escape string for use in HTML attributes
 * @param {string} string - Input string
 * @returns {string} - Attribute-safe string
 */
export function escapeAttribute(string) {
  if (!string) return '';
  return string.replace(
    /[&"'<>]/g,
    (character) =>
      ({
        '&': '&amp;',
        '"': '&quot;',
        "'": '&#39;',
        '<': '&lt;',
        '>': '&gt;',
      })[character]
  );
}

/**
 * Format a category ID into human-readable sentence case
 * @param {string} id - Category ID like "thought_leadership" or "AI_GENERATED"
 * @returns {string} - Formatted label like "Thought leadership"
 */
export function formatCategoryLabel(id) {
  if (!id) return '';
  return (
    id
      // Replace underscores with spaces
      .replace(/_/g, ' ')
      // Insert space before uppercase letters that follow lowercase (camelCase)
      .replace(/([a-z])([A-Z])/g, '$1 $2')
      // Convert to lowercase
      .toLowerCase()
      // Normalize multiple spaces
      .replace(/\s+/g, ' ')
      // Trim
      .trim()
      // Capitalize first letter
      .replace(/^\w/, (c) => c.toUpperCase())
  );
}
