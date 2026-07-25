# Page Pulse 🔍

> A fast, zero-dependency-frontend URL auditing tool. Paste any URL, get an instant SEO health report.

![Page Pulse screenshot placeholder — add your own once running]

---

## Table of Contents

1. [Setup & Running Locally](#setup--running-locally)
2. [API Contract](#api-contract)
3. [Design Decisions](#design-decisions)
4. [Deploying to Render](#deploying-to-render)
5. [Pushing to GitHub](#pushing-to-github)

---

## Setup & Running Locally

### Prerequisites

- **Node.js v18+** (uses native `AbortController` and `URL`)
- **npm v8+**

### Steps

```bash
# 1. Clone the repo
git clone https://github.com/YOUR_USERNAME/page-pulse.git
cd page-pulse

# 2. Install dependencies
npm install

# 3. Start the development server (with auto-restart on file changes)
npm run dev

# 4. Open in browser
open http://localhost:3000
```

### Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT`   | `3000`  | The port the server listens on |

Set a custom port:
```bash
PORT=8080 npm start
```

No `.env` file is needed for local development — `PORT` is the only variable this app reads.

### Available Scripts

| Script       | Command                              | Description                          |
|--------------|--------------------------------------|--------------------------------------|
| `npm start`  | `node src/server.js`                 | Production start                     |
| `npm run dev`| `node --watch src/server.js`         | Dev mode with auto-restart           |
| `npm test`   | `jest --runInBand --forceExit`       | Run all tests                        |

---

## API Contract

### `POST /api/audit`

Audits a URL and returns structured SEO and performance data.

#### Request

```
POST /api/audit
Content-Type: application/json
```

```json
{
  "url": "https://example.com"
}
```

| Field | Type   | Required | Description |
|-------|--------|----------|-------------|
| `url` | string | ✅       | A well-formed `http` or `https` URL to audit |

#### Success Response — `200 OK`

```json
{
  "httpStatus": 200,
  "responseTimeMs": 312,
  "pageTitle": "Example Domain",
  "metaDescription": "An example page for demonstration purposes.",
  "h1Count": 1,
  "imagesMissingAlt": 0,
  "wordCount": 247
}
```

| Field              | Type   | Description |
|--------------------|--------|-------------|
| `httpStatus`       | number | HTTP status code returned by the target URL |
| `responseTimeMs`   | number | Time in milliseconds to receive the full response |
| `pageTitle`        | string | Text content of `<title>` tag, empty string if absent |
| `metaDescription`  | string | `content` of `<meta name="description">`, empty string if absent |
| `h1Count`          | number | Number of `<h1>` elements on the page |
| `imagesMissingAlt` | number | Count of `<img>` tags with no `alt` attribute or an empty `alt` |
| `wordCount`        | number | Approximate count of visible words (script/style/markup stripped) |

#### Error Responses

| Status | Trigger | Example `error` message |
|--------|---------|------------------------|
| `400 Bad Request` | Missing, empty, or malformed URL; non-http/https protocol | `"Only http and https URLs are supported. Received protocol: "ftp:"."` |
| `415 Unsupported Media Type` | Target URL returns non-HTML content-type (e.g. `application/json`, `image/png`) | `"The URL did not return an HTML page. Got content-type: \"application/json\"."` |
| `502 Bad Gateway` | DNS failure, connection refused, host unreachable | `"Could not reach \"example.com\". The host may be down..."` |
| `504 Gateway Timeout` | Target server did not respond within 10 seconds | `"Request timed out after 10 seconds."` |
| `500 Internal Server Error` | Unexpected server-side error | `"An unexpected error occurred while fetching the page."` |

All error responses follow this shape:
```json
{
  "error": "Human-readable description of what went wrong."
}
```

Stack traces are **never** included in error responses.

---

## Design Decisions

> **Note to candidate:** The three sections below are placeholders for you to fill in with your own reasoning. Each decision is labeled so you know *what* was decided — write 2–3 sentences explaining *why* you made that choice, in your own words. Don't copy AI-generated filler.

---

### Decision 1: Pure parsing functions isolated in `src/parser.js`

**What was decided:** All cheerio-based extraction logic (`extractTitle`, `countH1s`, etc.) lives in a single file of pure functions that accept a loaded cheerio instance and return plain values. The route handler calls these functions but does not contain parsing logic itself.

**TODO — fill in your reasoning:** Why did you separate parsing into its own module? What does this make easier? How does it affect testability?

---

### Decision 2: `AbortController` + error-code inspection for error classification

**What was decided:** The fetch timeout uses a native `AbortController` rather than a library-level timeout option. DNS/connection errors are detected by inspecting `err.name` (for `AbortError`) and `err.cause.code` (for `ENOTFOUND`, `ECONNREFUSED`, etc.) to return different HTTP status codes (504 vs 502).

**TODO — fill in your reasoning:** Why differentiate between timeout (504) and DNS failure (502)? What does this tell an API consumer? What alternative did you consider?

---

### Decision 3: Single Express server serves both API and static frontend

**What was decided:** The Express server mounts the static `public/` directory at the root path and the `/api/audit` route on the same port. There is no separate frontend dev server or build step.

**TODO — fill in your reasoning:** Why did you choose this over a separate frontend server? What trade-offs does this involve? How does it affect deployment?

---

## Deploying to Render

Render's free tier supports Node.js web services with zero-config deploys.

### Steps

1. **Push to GitHub** (see next section first if you haven't already)

2. **Create a Render account** at [render.com](https://render.com) and sign in

3. **New → Web Service** — connect your GitHub account and select the `page-pulse` repo

4. **Configure the service:**
   | Setting         | Value                  |
   |-----------------|------------------------|
   | Environment     | `Node`                 |
   | Build Command   | `npm install`          |
   | Start Command   | `npm start`            |
   | Instance Type   | `Free`                 |

5. **Environment Variables** — Render sets `PORT` automatically; you don't need to add it

6. **Click "Create Web Service"** — Render will build and deploy. First deploy takes ~2 minutes.

7. Your live URL will be `https://page-pulse-XXXX.onrender.com` (shown in the dashboard)

> ⚠️ Free tier services spin down after 15 minutes of inactivity. The first request after spin-down takes ~30 seconds.

---

## Pushing to GitHub

```bash
# 1. Create a new PUBLIC repo on github.com (do NOT initialise with README)
#    Name it: page-pulse

# 2. Add remote (replace YOUR_USERNAME)
git remote add origin https://github.com/YOUR_USERNAME/page-pulse.git

# 3. Push
git push -u origin main
```

Your GitHub repo URL (for submission): `https://github.com/YOUR_USERNAME/page-pulse`

---

## Project Structure

```
page_pulse/
├── src/
│   ├── server.js      # Express app — serves static files + mounts API
│   ├── audit.js       # POST /api/audit route handler
│   ├── parser.js      # Pure cheerio parsing functions
│   └── validate.js    # URL validation helper
├── public/
│   ├── index.html     # Single-page frontend
│   ├── style.css      # Dark glassmorphism styles
│   └── app.js         # Frontend JS — fetch, render, state
├── tests/
│   ├── fixtures/
│   │   ├── full.html      # All SEO fields present
│   │   ├── empty.html     # No title / meta / h1 / imgs
│   │   └── partial.html   # Multiple h1s, missing alt on all imgs
│   ├── parser.test.js     # Unit tests for parser functions
│   └── audit.test.js      # Integration / failure-case tests
├── .gitignore
├── package.json
└── README.md
```
# page_pulse
