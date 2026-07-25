'use strict';

/**
 * audit.test.js
 *
 * Integration / failure-case tests for POST /api/audit.
 * Uses __setFetcher / __resetFetcher to inject mock HTTP responses
 * without touching Node's https module or any global.
 */

const request = require('supertest');

const MOCK_MINIMAL_HTML = `<!DOCTYPE html><html><head></head><body><p>Hello world</p></body></html>`;

// ── Shared mock fetcher ────────────────────────────────────────────────────
let mockFetcher;

// Load modules once
const { __setFetcher, __resetFetcher } = require('../src/audit');
const app = require('../src/server');

beforeEach(() => {
  // Default: minimal HTML, 200 OK
  mockFetcher = jest.fn().mockResolvedValue({
    status: 200,
    headers: { get: (h) => h === 'content-type' ? 'text/html; charset=utf-8' : null },
    text: async () => MOCK_MINIMAL_HTML,
  });
  __setFetcher(mockFetcher);
});

afterEach(() => {
  jest.clearAllMocks();
  __resetFetcher();
});

// ═══════════════════════════════════════════════════════════════════════════
// 400 — Invalid / malformed URL (validation runs before any fetch)
// ═══════════════════════════════════════════════════════════════════════════

describe('POST /api/audit — 400 Bad Request', () => {
  test('returns 400 when url field is missing from body', async () => {
    const res = await request(app)
      .post('/api/audit')
      .send({})
      .set('Content-Type', 'application/json');

    expect(res.status).toBe(400);
    expect(res.body).toHaveProperty('error');
    expect(typeof res.body.error).toBe('string');
    expect(res.body.error.length).toBeGreaterThan(0);
    expect(mockFetcher).not.toHaveBeenCalled();
  });

  test('returns 400 for a plainly malformed URL string', async () => {
    const res = await request(app)
      .post('/api/audit')
      .send({ url: 'not-a-url' })
      .set('Content-Type', 'application/json');

    expect(res.status).toBe(400);
    expect(res.body).toHaveProperty('error');
    expect(mockFetcher).not.toHaveBeenCalled();
  });

  test('returns 400 for a non-http protocol (ftp://)', async () => {
    const res = await request(app)
      .post('/api/audit')
      .send({ url: 'ftp://example.com/file.txt' })
      .set('Content-Type', 'application/json');

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/http/i);
  });

  test('returns 400 for empty string url', async () => {
    const res = await request(app)
      .post('/api/audit')
      .send({ url: '' })
      .set('Content-Type', 'application/json');

    expect(res.status).toBe(400);
    expect(res.body).toHaveProperty('error');
  });

  test('returns 400 for javascript: protocol', async () => {
    const res = await request(app)
      .post('/api/audit')
      .send({ url: 'javascript:alert(1)' })
      .set('Content-Type', 'application/json');

    expect(res.status).toBe(400);
    expect(res.body).toHaveProperty('error');
  });

  test('error responses never contain a stack trace', async () => {
    const res = await request(app)
      .post('/api/audit')
      .send({ url: 'not-a-url' })
      .set('Content-Type', 'application/json');

    const body = JSON.stringify(res.body);
    expect(body).not.toMatch(/at Object\./);
    expect(body).not.toMatch(/\.js:\d+/);
  });

  test('400 response body has only an "error" key — no leakage', async () => {
    const res = await request(app)
      .post('/api/audit')
      .send({ url: 'bad-url' })
      .set('Content-Type', 'application/json');

    expect(res.status).toBe(400);
    expect(Object.keys(res.body)).toEqual(['error']);
    expect(typeof res.body.error).toBe('string');
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// Graceful degradation — HTML missing all SEO fields
// ═══════════════════════════════════════════════════════════════════════════

describe('POST /api/audit — graceful degradation on minimal HTML', () => {
  test('returns 200 with empty strings and zeros when page has no SEO fields', async () => {
    const res = await request(app)
      .post('/api/audit')
      .send({ url: 'https://example.com' })
      .set('Content-Type', 'application/json');

    expect(res.status).toBe(200);
    expect(res.body.pageTitle).toBe('');
    expect(res.body.metaDescription).toBe('');
    expect(res.body.h1Count).toBe(0);
    expect(res.body.imagesMissingAlt).toBe(0);
    expect(typeof res.body.wordCount).toBe('number');
    expect(typeof res.body.responseTimeMs).toBe('number');
    expect(res.body.httpStatus).toBe(200);
  });

  test('returns 200 with correct values when full HTML is served', async () => {
    const richHtml = `
      <!DOCTYPE html>
      <html>
        <head>
          <title>Rich Test Page</title>
          <meta name="description" content="A rich test description." />
        </head>
        <body>
          <h1>Main Heading</h1>
          <p>The quick brown fox jumps over the lazy dog.</p>
          <img src="a.jpg" alt="" />
        </body>
      </html>
    `;

    mockFetcher.mockResolvedValueOnce({
      status: 200,
      headers: { get: (h) => h === 'content-type' ? 'text/html; charset=utf-8' : null },
      text: async () => richHtml,
    });

    const res = await request(app)
      .post('/api/audit')
      .send({ url: 'https://example.com' })
      .set('Content-Type', 'application/json');

    expect(res.status).toBe(200);
    expect(res.body.pageTitle).toBe('Rich Test Page');
    expect(res.body.metaDescription).toBe('A rich test description.');
    expect(res.body.h1Count).toBe(1);
    expect(res.body.imagesMissingAlt).toBe(1); // alt="" counts as missing
    expect(res.body.wordCount).toBeGreaterThan(5);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 504 — Timeout (AbortError)
// ═══════════════════════════════════════════════════════════════════════════

describe('POST /api/audit — 504 Gateway Timeout', () => {
  test('returns 504 when fetcher throws AbortError', async () => {
    const abortErr = Object.assign(new Error('Request aborted'), { name: 'AbortError' });
    mockFetcher.mockRejectedValueOnce(abortErr);

    const res = await request(app)
      .post('/api/audit')
      .send({ url: 'https://slow.example.com' })
      .set('Content-Type', 'application/json');

    expect(res.status).toBe(504);
    expect(res.body).toHaveProperty('error');
    expect(res.body.error).toMatch(/timed? ?out/i);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 502 — Network / DNS / connection failure
// ═══════════════════════════════════════════════════════════════════════════

describe('POST /api/audit — 502 Bad Gateway', () => {
  test('returns 502 when fetcher throws ENOTFOUND (DNS failure)', async () => {
    const err = Object.assign(new Error('getaddrinfo ENOTFOUND'), { code: 'ENOTFOUND' });
    mockFetcher.mockRejectedValueOnce(err);

    const res = await request(app)
      .post('/api/audit')
      .send({ url: 'https://definitely-does-not-exist-xyz.com' })
      .set('Content-Type', 'application/json');

    expect(res.status).toBe(502);
    expect(res.body).toHaveProperty('error');
  });

  test('returns 502 when fetcher throws ECONNREFUSED', async () => {
    const err = Object.assign(new Error('connect ECONNREFUSED'), { code: 'ECONNREFUSED' });
    mockFetcher.mockRejectedValueOnce(err);

    const res = await request(app)
      .post('/api/audit')
      .send({ url: 'https://localhost:19999' })
      .set('Content-Type', 'application/json');

    expect(res.status).toBe(502);
    expect(res.body).toHaveProperty('error');
  });

  test('returns 502 when global fetch throws TypeError("fetch failed")', async () => {
    const err = new TypeError('fetch failed');
    mockFetcher.mockRejectedValueOnce(err);

    const res = await request(app)
      .post('/api/audit')
      .send({ url: 'https://example.com' })
      .set('Content-Type', 'application/json');

    expect(res.status).toBe(502);
    expect(res.body).toHaveProperty('error');
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 415 — Non-HTML content type
// ═══════════════════════════════════════════════════════════════════════════

describe('POST /api/audit — 415 Unsupported Media Type', () => {
  test('returns 415 when content-type is application/json', async () => {
    mockFetcher.mockResolvedValueOnce({
      status: 200,
      headers: { get: (h) => h === 'content-type' ? 'application/json' : null },
      text: async () => '{"not": "html"}',
    });

    const res = await request(app)
      .post('/api/audit')
      .send({ url: 'https://api.example.com/data' })
      .set('Content-Type', 'application/json');

    expect(res.status).toBe(415);
    expect(res.body).toHaveProperty('error');
    expect(res.body.error).toMatch(/html/i);
  });

  test('returns 415 when content-type is image/png', async () => {
    mockFetcher.mockResolvedValueOnce({
      status: 200,
      headers: { get: (h) => h === 'content-type' ? 'image/png' : null },
      text: async () => '',
    });

    const res = await request(app)
      .post('/api/audit')
      .send({ url: 'https://example.com/logo.png' })
      .set('Content-Type', 'application/json');

    expect(res.status).toBe(415);
    expect(res.body).toHaveProperty('error');
  });
});
