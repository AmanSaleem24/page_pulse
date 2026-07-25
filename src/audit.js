/**
 * audit.js
 *
 * Express route handler for POST /api/audit.
 * Uses Node's native https/http modules for maximum site compatibility —
 * avoids undici's HTTP/2 quirks that cause certain sites to drop connections.
 */

'use strict';

const https  = require('https');
const http   = require('http');
const zlib   = require('zlib');
const cheerio = require('cheerio');
const { validateUrl } = require('./validate');
const {
  extractTitle,
  extractMetaDescription,
  countH1s,
  countImagesMissingAlt,
  countWords,
} = require('./parser');

const FETCH_TIMEOUT_MS = 10_000;
const MAX_REDIRECTS    = 5;

// Full browser-like headers to pass WAF / bot-detection checks
const REQUEST_HEADERS = {
  'User-Agent':
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36',
  'Accept':
    'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
  'Accept-Language': 'en-US,en;q=0.9',
  'Accept-Encoding': 'gzip, deflate, br',
  'Cache-Control': 'max-age=0',
  'Upgrade-Insecure-Requests': '1',
  'Connection': 'keep-alive',
};

// Network-level error codes emitted by Node's http/https modules
const NETWORK_ERROR_CODES = new Set([
  'ENOTFOUND', 'ECONNREFUSED', 'ECONNRESET', 'ETIMEDOUT',
  'ENETUNREACH', 'EHOSTUNREACH', 'EPIPE', 'ENOENT',
  // undici (global fetch) internal codes kept for completeness
  'UND_ERR_SOCKET', 'UND_ERR_CONNECT_TIMEOUT',
  'UND_ERR_HEADERS_TIMEOUT', 'UND_ERR_BODY_TIMEOUT',
]);

/**
 * Minimal HTTP/HTTPS fetcher built on Node's native modules.
 * Follows redirects, decompresses gzip/deflate/br, respects AbortSignal.
 *
 * @param {string} targetUrl
 * @param {{ signal?: AbortSignal, headers?: object }} options
 * @returns {Promise<{ status: number, headers: { get(name:string): string|null }, text(): Promise<string> }>}
 */
function httpFetch(targetUrl, { signal, headers = {} } = {}) {
  return new Promise((resolve, reject) => {
    let hopsLeft = MAX_REDIRECTS;

    function doRequest(url) {
      if (signal?.aborted) {
        return reject(Object.assign(new Error('Request aborted'), { name: 'AbortError' }));
      }

      const parsed = new URL(url);
      const mod    = parsed.protocol === 'https:' ? https : http;

      const reqOptions = {
        hostname: parsed.hostname,
        port:     parsed.port || (parsed.protocol === 'https:' ? 443 : 80),
        path:     (parsed.pathname || '/') + parsed.search,
        method:   'GET',
        headers,
      };

      const req = mod.request(reqOptions, (res) => {
        // ── Follow redirects ─────────────────────────────────────────
        if ([301, 302, 303, 307, 308].includes(res.statusCode) && res.headers.location) {
          if (hopsLeft-- <= 0) {
            return reject(new Error('Too many redirects'));
          }
          res.resume(); // drain & discard redirect body
          return doRequest(new URL(res.headers.location, url).href);
        }

        // ── Decompress body ──────────────────────────────────────────
        let stream = res;
        const enc  = res.headers['content-encoding'];
        if (enc === 'gzip')    stream = res.pipe(zlib.createGunzip());
        else if (enc === 'deflate') stream = res.pipe(zlib.createInflate());
        else if (enc === 'br') stream = res.pipe(zlib.createBrotliDecompress());

        const chunks = [];
        stream.on('data', (c) => chunks.push(c));
        stream.on('end', () => {
          const bodyText = Buffer.concat(chunks).toString('utf-8');
          resolve({
            status:  res.statusCode,
            headers: { get: (name) => res.headers[name.toLowerCase()] ?? null },
            text:    async () => bodyText,
          });
        });
        stream.on('error', reject);
      });

      req.on('error', reject);

      // ── AbortSignal wiring ───────────────────────────────────────
      if (signal) {
        const onAbort = () => {
          req.destroy();
          reject(Object.assign(new Error('Request aborted'), { name: 'AbortError' }));
        };
        signal.addEventListener('abort', onAbort, { once: true });
        // Clean up listener once request finishes
        req.on('close', () => signal.removeEventListener('abort', onAbort));
      }

      req.end();
    }

    doRequest(targetUrl);
  });
}

/**
 * Checks whether an error is a network-level failure.
 */
function isNetworkError(err) {
  // Global fetch always wraps network issues as exactly TypeError('fetch failed')
  if (err instanceof TypeError && err.message === 'fetch failed') return true;

  // Native https.request emits plain errors with .code
  const code = err?.code ?? err?.cause?.code ?? '';
  return NETWORK_ERROR_CODES.has(code);
}

/**
 * @param {import('express').Request} req
 * @param {import('express').Response} res
 */
async function auditHandler(req, res) {
  // ── 1. Validate input ──────────────────────────────────────────────────────
  const { url: rawUrl } = req.body || {};
  const validation = validateUrl(rawUrl);

  if (!validation.valid) {
    return res.status(400).json({ error: validation.error });
  }

  const targetUrl = validation.url.href;

  // ── 2. Fetch with timeout ──────────────────────────────────────────────────
  const controller = new AbortController();
  const timeoutId  = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

  let response;
  const startTime = Date.now();

  try {
    response = await _fetcher(targetUrl, {
      signal:  controller.signal,
      headers: REQUEST_HEADERS,
    });
  } catch (err) {
    clearTimeout(timeoutId);

    if (err.name === 'AbortError') {
      return res.status(504).json({
        error: `Request timed out after ${FETCH_TIMEOUT_MS / 1000} seconds. The server may be slow or unreachable.`,
      });
    }

    if (isNetworkError(err)) {
      console.error('[audit] Network error:', err.code ?? err.message);
      return res.status(502).json({
        error: `Could not reach "${validation.url.hostname}". The host may be down, unreachable, or the domain may not exist.`,
      });
    }

    console.error('[audit] Unexpected fetch error:', err);
    return res.status(500).json({ error: 'An unexpected error occurred while fetching the page.' });
  } finally {
    clearTimeout(timeoutId);
  }

  const responseTimeMs = Date.now() - startTime;

  // ── 3. Content-type guard ──────────────────────────────────────────────────
  const contentType = response.headers.get('content-type') || '';
  if (!contentType.includes('text/html') && !contentType.includes('application/xhtml')) {
    return res.status(415).json({
      error: `The URL did not return an HTML page. Got content-type: "${contentType}". Only HTML pages can be audited.`,
    });
  }

  // ── 4. Read body & parse ───────────────────────────────────────────────────
  let html;
  try {
    html = await response.text();
  } catch (err) {
    console.error('[audit] Error reading response body:', err);
    return res.status(500).json({ error: 'Failed to read the page content.' });
  }

  const $ = cheerio.load(html);

  // ── 5. Return structured result ────────────────────────────────────────────
  return res.status(200).json({
    httpStatus: response.status,
    responseTimeMs,
    pageTitle:        extractTitle($),
    metaDescription:  extractMetaDescription($),
    h1Count:          countH1s($),
    imagesMissingAlt: countImagesMissingAlt($),
    wordCount:        countWords($),
  });
}

// ── Test seam — swap the fetcher in unit/integration tests ───────────────
let _fetcher = httpFetch;
function __setFetcher(fn) { _fetcher = fn; }
function __resetFetcher() { _fetcher = httpFetch; }

module.exports = { auditHandler, __setFetcher, __resetFetcher };
