/**
 * app.js — Page Pulse frontend logic
 *
 * Handles form submission, loading/error/result states,
 * and renders the audit report from /api/audit response.
 */

'use strict';

/* ── Element refs ──────────────────────────────────────────── */
const form           = document.getElementById('audit-form');
const urlInput       = document.getElementById('url-input');
const auditBtn       = document.getElementById('audit-btn');
const loadingState   = document.getElementById('loading-state');
const errorState     = document.getElementById('error-state');
const errorMsg       = document.getElementById('error-message');
const errorBadge     = document.getElementById('error-status-badge');
const resultsState   = document.getElementById('results-state');

/* ── State helpers ─────────────────────────────────────────── */
function showOnly(el) {
  [loadingState, errorState, resultsState].forEach(s => {
    s.hidden = s !== el;
  });
  if (el === null) {
    loadingState.hidden = true;
    errorState.hidden   = true;
    resultsState.hidden = true;
  }
}

function setLoading(on) {
  auditBtn.disabled = on;
  auditBtn.querySelector('.btn-text').textContent = on ? 'Auditing…' : 'Audit URL';
}

/* ── Form submission ───────────────────────────────────────── */
form.addEventListener('submit', async (e) => {
  e.preventDefault();

  const url = urlInput.value.trim();
  if (!url) {
    urlInput.focus();
    return;
  }

  setLoading(true);
  showOnly(loadingState);

  try {
    const res = await fetch('/api/audit', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url }),
    });

    const data = await res.json();

    if (!res.ok) {
      showError(data.error || `Server returned ${res.status}.`, res.status);
      return;
    }

    renderResults(url, data);

  } catch (err) {
    // Network error (server unreachable from client side)
    showError('Could not connect to the Page Pulse server. Please make sure it is running.');
  } finally {
    setLoading(false);
  }
});

/* ── Error display ─────────────────────────────────────────── */
function showError(message, statusCode) {
  errorMsg.textContent = message;

  if (statusCode) {
    errorBadge.textContent = `HTTP ${statusCode}`;
    errorBadge.hidden = false;
  } else {
    errorBadge.hidden = true;
  }

  showOnly(errorState);
}

/* ── Result rendering ──────────────────────────────────── */
function renderResults(url, data) {
  // URL label
  document.getElementById('results-url').textContent = url;

  // HTTP Status — colour code
  const statusEl = document.getElementById('val-status');
  const statusCard = document.getElementById('metric-status');
  statusEl.textContent = data.httpStatus;
  statusCard.classList.remove('status-ok', 'status-warn', 'status-err');
  if (data.httpStatus >= 200 && data.httpStatus < 300) {
    statusCard.classList.add('status-ok');
  } else if (data.httpStatus >= 300 && data.httpStatus < 500) {
    statusCard.classList.add('status-warn');
  } else {
    statusCard.classList.add('status-err');
  }

  // Response time
  document.getElementById('val-response-time').textContent = data.responseTimeMs.toLocaleString();

  // Word count
  document.getElementById('val-words').textContent = data.wordCount.toLocaleString();

  // H1 count
  const h1El = document.getElementById('val-h1');
  h1El.textContent = data.h1Count;

  // Images missing alt — colour code
  const imgsEl   = document.getElementById('val-imgs');
  const imgsCard = document.getElementById('metric-imgs');
  imgsEl.textContent = data.imagesMissingAlt;
  imgsCard.classList.remove('has-issues', 'no-issues');
  imgsCard.classList.add(data.imagesMissingAlt > 0 ? 'has-issues' : 'no-issues');

  // Page title
  const titleEl = document.getElementById('val-title');
  if (data.pageTitle) {
    titleEl.textContent = data.pageTitle;
    titleEl.classList.remove('missing');
  } else {
    titleEl.textContent = '(no title found)';
    titleEl.classList.add('missing');
  }

  // Meta description
  const metaEl = document.getElementById('val-meta');
  if (data.metaDescription) {
    metaEl.textContent = data.metaDescription;
    metaEl.classList.remove('missing');
  } else {
    metaEl.textContent = '(no meta description found)';
    metaEl.classList.add('missing');
  }

  showOnly(resultsState);

  // Scroll results into view smoothly
  resultsState.scrollIntoView({ behavior: 'smooth', block: 'start' });
}
