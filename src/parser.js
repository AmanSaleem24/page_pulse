/**
 * parser.js
 *
 * Pure functions that extract SEO and content metrics from a Cheerio root.
 * All functions accept the object returned by cheerio.load() and return
 * plain values — no I/O, fully unit-testable without network calls.
 */

'use strict';

/**
 * Extracts the page title from <title> tag.
 * @param {import('cheerio').CheerioAPI} $ - Loaded Cheerio instance
 * @returns {string}
 */
function extractTitle($) {
  return $('title').first().text().trim();
}

/**
 * Extracts the meta description content.
 * @param {import('cheerio').CheerioAPI} $ - Loaded Cheerio instance
 * @returns {string} Empty string if not found
 */
function extractMetaDescription($) {
  const meta = $('meta[name="description"]').first();
  if (!meta.length) return '';
  return (meta.attr('content') || '').trim();
}

/**
 * Counts the number of <h1> elements on the page.
 * @param {import('cheerio').CheerioAPI} $ - Loaded Cheerio instance
 * @returns {number}
 */
function countH1s($) {
  return $('h1').length;
}

/**
 * Counts <img> tags that have no alt attribute or an empty alt attribute.
 * @param {import('cheerio').CheerioAPI} $ - Loaded Cheerio instance
 * @returns {number}
 */
function countImagesMissingAlt($) {
  let count = 0;
  $('img').each((_, el) => {
    const alt = $(el).attr('alt');
    if (alt === undefined || alt.trim() === '') {
      count++;
    }
  });
  return count;
}

/**
 * Approximates the visible word count of body text.
 * Strips <script>, <style>, <noscript>, and all remaining HTML tags,
 * then splits on whitespace.
 * @param {import('cheerio').CheerioAPI} $ - Loaded Cheerio instance
 * @returns {number}
 */
function countWords($) {
  // Clone body, remove non-visible elements
  const body = $('body').clone();
  body.find('script, style, noscript, iframe, svg').remove();

  // Get raw text, collapse whitespace
  const text = body.text().replace(/\s+/g, ' ').trim();
  if (!text) return 0;

  // Split on whitespace and filter empty strings
  return text.split(/\s+/).filter(Boolean).length;
}

module.exports = {
  extractTitle,
  extractMetaDescription,
  countH1s,
  countImagesMissingAlt,
  countWords,
};
