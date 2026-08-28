# MetLife Smart Cover Letter — Web Edition

Web-migrated version of the original MetLife Smart Cover Letter Electron
desktop app. **Read this whole file before running anything.**

---

## What's in this package

```
webapp/
├── frontend/     Static web app — served by the backend, runs in the browser
├── backend/      Node/Express server — PDF generation (Playwright), templates
├── helper/       Local Windows Helper — runs on EACH AGENT'S OWN machine,
│                 talks to Outlook via the SAME PowerShell script the
│                 original Electron app used
└── README.md     This file
```

## Architecture

```
Agent's Browser  ──HTTPS──▶  Backend (internal server)
      │                            │
      │                      generates PDF (Playwright)
      │                      resolves email templates (Excel)
      │                            │
      │◀───────────────────────────┘  PDF bytes + template data
      │
      │  (same machine, loopback only)
      ▼
Local Helper (127.0.0.1:5175)
      │
      ▼
PowerShell → Outlook COM → Draft email (from the real .oft template,
                            if configured) → Agent clicks Send
```

The **backend** is a normal internal web server — deploy it once, all agents
share it. The **Local Helper** must run **on every agent's own PC**, because
it's the only piece that can talk to that agent's own Outlook installation.

---

## ✅ Confirmed network paths (from the real company Excel workflow)

These were verified working against the actual company file share:

| What | Path | Status |
|---|---|---|
| Excel folder | `\\Egcai1metfsp01\clmcsc\Official Complains\OnePlace` | Confirmed reachable |
| Excel file | *(exact `.xlsx` filename not yet confirmed)* | ⬜ Still needed |
| Outlook template (.oft) | `\\Egcai1metfsp01\clmcsc\Official Complains\OnePlace\Reff\Coverage letter.oft` | ✅ Confirmed — opened successfully via Windows Explorer |

Both are already set in `backend/.env` — **only the Excel filename still
needs filling in** (see the `<excel-filename>` placeholder in that file).
Once you have it, edit `backend/.env`'s `EXCEL_TEMPLATE_PATH` line and
restart the backend — nothing else needs to change.

### What to ask IT for
- **Read-only** access to the folder above, for the account the backend
  server runs as (not your personal account — the backend process's own
  identity). You've already confirmed your own account can read it, which
  is a good sign the same grant will work for the service account.
- The exact `.xlsx` filename inside that folder (or just point them at the
  folder and ask "which file has the 'Send it' button's data source").
- Confirmation of the real column headers in that Excel sheet, so
  `backend/excel/reader.js`'s `EXPECTED_COLUMNS` can be set to match exactly
  (see that file's header comment — one line per column, no other code
  changes needed).

---

## What's new in this version: real Outlook template (.oft) support

The original company Excel macro didn't build a dynamic email — it opened
a real Outlook template (`Coverage letter.oft`) with a fixed CC and let the
agent fill in the rest by hand. This version now supports opening that
**same real template** automatically, with the dynamic fields (patient
name, CRT, PDF attachment) filled in on top of it:

- `helper/scripts/send-outlook-email.ps1` — new `-OftPath` parameter. When
  set and the file is reachable, it calls `CreateItemFromTemplate()`
  instead of a blank `CreateItem(0)`. If the path is blank or unreachable,
  it falls back to today's blank-item behavior automatically — no crash.
- **Important, read this if the template's own look changes unexpectedly:**
  when a template is used, this script **does not** overwrite the
  template's own body content (`$mail.Body`) — only `To`/`CC`/`BCC`/
  `Subject`/attachment are applied on top. This is deliberate: writing to
  `$mail.Body` (a plain-text property) on a mail item created from a rich
  template would silently strip out the template's own formatting/logo. If
  you need patient-specific text merged *inside* the template's own body
  later, that's a separate, template-structure-specific piece of work —
  it needs to see the template's actual internal layout first.
- `helper/emailHelper.js` and `helper/server.js` both forward `oftPath`
  through end-to-end — already wired, nothing left to connect.
- `frontend/js/email.js` already sends `oftPath` from the resolved
  template config (Excel-derived or default) with every request.

---

## What's new in this version: image-based header/footer

The live preview's header and footer are now single full-width images
(`frontend/assets/images/letter-header.png` and `letter-footer.png` —
taken directly from the real letter's actual appearance) instead of
hand-coded HTML/CSS text. This matches the original letter exactly, pixel
for pixel, rather than approximating it with styled text.

- `frontend/index.html` — `.cl-header`/`.cl-footer` now each contain one
  `<img>` instead of a text/logo block.
- `frontend/css/preview.css` — the old text-based header/footer rules are
  kept commented-out in place (search for "superseded rules") in case a
  future revision needs to go back to coded text instead of images.
- No JS changes were needed for this — `js/preview.js`'s image-path
  rewriting (`getLetterHtml()`) already operates generically on every
  `<img>` in the letter, so the new images are picked up automatically.

---

## ⚠️ Two things this package still cannot include

### 1. Font files (5-minute fix)
See `frontend/assets/fonts/README.md` for exact download links. Until
added, the app still works — text just renders in a system fallback font.

### 2. Playwright's browser binary (one command, needs internet once)
```bash
cd backend
npm install
npx playwright install chromium
```
After this one-time download, the backend needs no internet access to run.

---

## Setup — local development

### 1. Backend
```bash
cd backend
npm install
npx playwright install chromium   # one-time, needs internet
npm start
```
Runs on `http://localhost:4000` and serves the frontend automatically.

`backend/.env` already has the confirmed OFT path and a near-complete
Excel path (just needs the filename — see above). If you don't yet have
the Excel filename, the app runs fine regardless — it falls back to one
default template automatically.

### 2. Local Helper (only needed to test the Outlook step — requires Windows + Outlook)
```bash
cd helper
npm install
# helper/.env already exists with default values — edit HELPER_AUTH_TOKEN
# to a real value, and update frontend/config/app-config.js's
# helperAuthToken to match it exactly.
npm start
```
Runs on `http://127.0.0.1:5175`. Requires Windows + Classic Outlook,
installed and signed in (see "Classic vs. New Outlook" below).

---

## ⚠️ Fixes applied during real-world testing (read if anything looks broken)

Two real PDF-rendering bugs were found and fixed while testing this
package against the actual Windows/Outlook environment — both are
explained in full in `backend/pdf/renderer.js`'s header comment:

1. **Malformed `file://` URL on Windows** — manually building a file URL
   from a Windows path produced an invalid URL (missing a slash). This
   passed testing in a Linux sandbox by coincidence (POSIX paths already
   start with `/`) and only broke on the real Windows deployment.
2. **Chromium blocks local `file://` stylesheet loading from
   `page.setContent()` pages** — even after fixing bug #1's URL format,
   Chromium's own security model still refused to load local files into a
   page with no real origin. Confirmed by testing.

**The fix:** CSS is now loaded over plain HTTP from the same backend that
serves the frontend (`http://localhost:4000/css/*.css`), the same way
letter images already load — never `file://` anywhere in the PDF pipeline.
This is the current, verified-working approach — if you see broken/
unstyled PDF output again, check that `backend/server.js`'s
`express.static(FRONTEND_DIR)` line is intact and that `frontend/css/`
actually contains the CSS files, before assuming it's a new bug.

---

## Reused verbatim vs. new

| Reused byte-for-byte | Adapted (transport only) | New |
|---|---|---|
| `frontend/js/parser.js` | `frontend/js/pdf.js` | `frontend/js/api.js` |
| `frontend/js/validation.js` | `frontend/js/email.js` | `frontend/js/templates.js` |
| `frontend/js/preview.js` | `frontend/js/app.js` | `backend/*` (all of it) |
| `frontend/js/stamp.js` | | `helper/server.js` |
| `frontend/js/utils.js` | | `backend/excel/reader.js` |
| `frontend/config/*.js` | | `frontend/css/fonts.css` |
| Most of `frontend/css/*.css` | | Header/footer images |

`helper/scripts/send-outlook-email.ps1` is the original file, extended
(not replaced) with the optional `-OftPath` parameter — the core
`.Display()`-only, never-`.Send()` guarantee is the same code path as
before.

---

## Classic Outlook vs. New Outlook

Unchanged from the original app: requires **Classic Outlook for
Windows**, installed and signed in. New Outlook does not implement the
`Outlook.Application` COM interface this depends on.

---

## Security notes

- The Local Helper binds to `127.0.0.1` only.
- A shared token (`X-Helper-Token` header) plus an `Origin` allow-list are
  both required before the Helper acts on a request.
- No arbitrary file paths are ever accepted from the browser — the Helper
  always writes incoming PDF bytes to its own private, generated-name temp
  file.
- PowerShell is invoked via `execFile` with a discrete argument array —
  never a concatenated command string.

**Before deploying to real agents:** change `HELPER_AUTH_TOKEN` in
`helper/.env` (and the matching value in `frontend/config/app-config.js`)
away from the placeholder default.

---

## What to test before rolling out to agents

1. Start the backend, open it in a browser.
2. Fill in the form (or use Quick Paste) — confirm the live preview
   updates, including the new header/footer images.
3. Click Generate PDF — confirm it matches the preview exactly, Arabic
   text intact.
4. Start the Helper on a Windows machine with Classic Outlook.
5. Click Send Email — confirm Outlook opens (from the real `.oft`
   template, once its path is fully confirmed) with the PDF attached, and
   the draft is **not** already sent.
6. Manually click Send in Outlook yourself.
