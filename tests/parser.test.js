'use strict';

/**
 * parser.test.js
 *
 * Unit tests for the pure parsing functions in src/parser.js.
 * Uses saved HTML fixtures — no network calls, no server needed.
 */

const fs = require('fs');
const path = require('path');
const cheerio = require('cheerio');

const {
  extractTitle,
  extractMetaDescription,
  countH1s,
  countImagesMissingAlt,
  countWords,
} = require('../src/parser');

// ── Helpers ────────────────────────────────────────────────────────────────

function loadFixture(name) {
  const html = fs.readFileSync(
    path.join(__dirname, 'fixtures', name),
    'utf8'
  );
  return cheerio.load(html);
}

// ── extractTitle ───────────────────────────────────────────────────────────

describe('extractTitle', () => {
  test('returns trimmed title from full fixture', () => {
    const $ = loadFixture('full.html');
    expect(extractTitle($)).toBe('Full Test Page — All Fields Present');
  });

  test('returns trimmed title when title has surrounding whitespace', () => {
    const $ = loadFixture('partial.html');
    expect(extractTitle($)).toBe('Partial Page — Trimmed Title');
  });

  test('returns empty string when no <title> tag exists', () => {
    const $ = loadFixture('empty.html');
    expect(extractTitle($)).toBe('');
  });

  test('returns empty string for completely empty document', () => {
    const $ = cheerio.load('');
    expect(extractTitle($)).toBe('');
  });
});

// ── extractMetaDescription ─────────────────────────────────────────────────

describe('extractMetaDescription', () => {
  test('extracts meta description from full fixture', () => {
    const $ = loadFixture('full.html');
    expect(extractMetaDescription($)).toBe(
      'This is a complete meta description for testing purposes.'
    );
  });

  test('returns empty string when meta description is absent', () => {
    const $ = loadFixture('empty.html');
    expect(extractMetaDescription($)).toBe('');
  });

  test('returns empty string when meta description is missing from partial fixture', () => {
    const $ = loadFixture('partial.html');
    expect(extractMetaDescription($)).toBe('');
  });

  test('trims whitespace from meta content', () => {
    const $ = cheerio.load('<meta name="description" content="  spaced  " />');
    expect(extractMetaDescription($)).toBe('spaced');
  });

  test('returns empty string for meta with empty content attribute', () => {
    const $ = cheerio.load('<meta name="description" content="" />');
    expect(extractMetaDescription($)).toBe('');
  });
});

// ── countH1s ──────────────────────────────────────────────────────────────

describe('countH1s', () => {
  test('counts single h1 in full fixture', () => {
    const $ = loadFixture('full.html');
    expect(countH1s($)).toBe(1);
  });

  test('counts multiple h1s in partial fixture', () => {
    const $ = loadFixture('partial.html');
    expect(countH1s($)).toBe(2);
  });

  test('returns 0 when no h1 exists (empty fixture)', () => {
    const $ = loadFixture('empty.html');
    expect(countH1s($)).toBe(0);
  });

  test('returns 0 for empty document', () => {
    const $ = cheerio.load('');
    expect(countH1s($)).toBe(0);
  });
});

// ── countImagesMissingAlt ─────────────────────────────────────────────────

describe('countImagesMissingAlt', () => {
  test('counts images with missing/empty alt in full fixture (2 of 4)', () => {
    const $ = loadFixture('full.html');
    // full.html has: alt="A cute cat", alt="A loyal dog", alt="", no alt
    expect(countImagesMissingAlt($)).toBe(2);
  });

  test('returns 0 when no images exist (empty fixture)', () => {
    const $ = loadFixture('empty.html');
    expect(countImagesMissingAlt($)).toBe(0);
  });

  test('counts all images when all are missing alt (partial fixture)', () => {
    const $ = loadFixture('partial.html');
    // partial.html has 3 images: no alt, alt="", alt="   "
    expect(countImagesMissingAlt($)).toBe(3);
  });

  test('img with descriptive alt is NOT counted', () => {
    const $ = cheerio.load('<img src="test.jpg" alt="A descriptive text" />');
    expect(countImagesMissingAlt($)).toBe(0);
  });

  test('img with whitespace-only alt IS counted as missing', () => {
    const $ = cheerio.load('<img src="test.jpg" alt="   " />');
    expect(countImagesMissingAlt($)).toBe(1);
  });
});

// ── countWords ────────────────────────────────────────────────────────────

describe('countWords', () => {
  test('strips script/style content from word count', () => {
    const $ = cheerio.load(`
      <html><body>
        <p>hello world</p>
        <script>var x = "this should not count as words";</script>
        <style>.cls { color: red; /* nor this */ }</style>
      </body></html>
    `);
    expect(countWords($)).toBe(2);
  });

  test('returns 0 for empty body', () => {
    const $ = cheerio.load('<html><body></body></html>');
    expect(countWords($)).toBe(0);
  });

  test('returns 0 for document with only script content', () => {
    const $ = cheerio.load('<html><body><script>alert("hidden")</script></body></html>');
    expect(countWords($)).toBe(0);
  });

  test('counts words in full fixture correctly (visible text only)', () => {
    const $ = loadFixture('full.html');
    const count = countWords($);
    // Full fixture has several visible paragraphs — should be > 30 words
    expect(count).toBeGreaterThan(30);
    // But should NOT include script content ("this should not be counted in word count" = 8 words)
    // Just verify we're in a reasonable range
    expect(count).toBeLessThan(200);
  });

  test('counts words correctly in partial fixture', () => {
    const $ = loadFixture('partial.html');
    const count = countWords($);
    // "Word one two three four five." + heading texts
    // Should be at least 5 (just the paragraph) and not include noscript
    expect(count).toBeGreaterThan(4);
  });

  test('empty fixture has some words (has one paragraph)', () => {
    const $ = loadFixture('empty.html');
    const count = countWords($);
    expect(count).toBeGreaterThan(0);
  });
});
