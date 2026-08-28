# Fonts — one manual step required before this is fully offline

**This package does NOT include the actual Inter/Cairo font binary files.**

Why: this project was assembled in a sandboxed environment with no access to
`fonts.google.com` / `fonts.gstatic.com`, so the real `.woff2` files could
not be downloaded and bundled automatically. `frontend/css/fonts.css` is
already written and ready — it just needs the actual font files to exist
at the paths it references.

This is the same gap that existed in the original Electron app (it loaded
these same two font families from Google Fonts' CDN) — this package closes
it structurally (local `@font-face` instead of a CDN `<link>`), you just
need to supply the files once.

## What to do (5 minutes, on any machine with internet access)

1. Go to **fonts.google.com/specimen/Inter** → **Download family**, and
   **fonts.google.com/specimen/Cairo** → **Download family**. Both are
   open-source (SIL Open Font License) and safe to redistribute internally.
2. Convert to `.woff2` (Google's download gives `.ttf`) — the easiest way
   is **gwfh.mranftl.com/fonts** (google-webfonts-helper), which lets you
   pick exactly these weights and download ready-made `.woff2` files
   directly:
   ```
   Inter-Regular.woff2    (400)
   Inter-Medium.woff2     (500)
   Inter-SemiBold.woff2   (600)
   Inter-Bold.woff2       (700)
   Cairo-Regular.woff2    (400)
   Cairo-SemiBold.woff2   (600)
   Cairo-Bold.woff2       (700)
   ```
3. Place all 7 files in `frontend/assets/fonts/` — only one copy is needed
   (the backend's PDF renderer loads CSS, and therefore these fonts, over
   HTTP from the frontend's own static files, the same way it already
   loads the letter images — see `backend/pdf/renderer.js`'s header
   comment for the full story).
4. That's it — `fonts.css` already points at these exact filenames.
   Reload the app.

## How to verify it worked
Open the app with your network disconnected. If the live preview and a
generated PDF still show the intended Inter/Cairo typefaces (not a system
fallback like Segoe UI/Arial), the fonts are wired correctly.
