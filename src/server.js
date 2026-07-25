/**
 * server.js
 *
 * Main Express application. Serves the static frontend from /public and
 * mounts the /api/audit route. Reads PORT from environment so it deploys
 * cleanly to Render / Railway / Fly without any changes.
 */

'use strict';

const express = require('express');
const path = require('path');
const { auditHandler } = require('./audit');

const app = express();
const PORT = process.env.PORT || 5001;

// ── Middleware ─────────────────────────────────────────────────────────────
app.use(express.json({ limit: '10kb' }));
app.use(express.static(path.join(__dirname, '..', 'public')));

// ── API Routes ─────────────────────────────────────────────────────────────
app.post('/api/audit', auditHandler);

// ── 404 handler for unknown API routes ────────────────────────────────────
app.use('/api/*', (req, res) => {
  res.status(404).json({ error: 'API route not found.' });
});

// ── Catch-all: serve index.html for frontend routes ────────────────────────
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'public', 'index.html'));
});

// ── Global error handler (safety net — should not normally fire) ───────────
app.use((err, req, res, _next) => {
  console.error('[server] Unhandled error:', err);
  res.status(500).json({ error: 'An unexpected server error occurred.' });
});

// ── Start (only when run directly, not when imported by tests) ────────────
if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`🚀 Page Pulse running at http://localhost:${PORT}`);
  });
}

module.exports = app; // exported for testing
