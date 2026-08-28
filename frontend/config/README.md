# Configuration Layer

This folder is the single source of truth for every business string,
version number, and application-wide setting in the app. Nothing outside
`config/` should hardcode a CC address, an email template, a filename
pattern, or the app's name/version — if you find one, it's a bug.

## How the layer is structured

```
config/
├── build-info.js    # Version/build metadata. Self-contained.
├── app-config.js     # App-wide, non-business settings. Self-contained.
├── email-config.js    # Email workflow business data (recipients, templates).
└── pdf-config.js        # PDF attachment naming, derived from email-config.js.
```

Every file works in both places the app runs code, without a bundler:

- **Browser / renderer** (plain `<script>` tags in `index.html`): each
  file attaches its config object onto a shared `window.MLConfig`
  namespace — `window.MLConfig.build`, `.app`, `.email`, `.pdf`.
- **Node / Electron main process**: each file also supports
  `require('./config/xxx-config')`, returning `{ XXX_CONFIG }`.

**Load order matters** and is fixed in `index.html`:

```html
<script src="config/build-info.js"></script>
<script src="config/app-config.js"></script>
<script src="config/email-config.js"></script>
<script src="config/pdf-config.js"></script>
```

`pdf-config.js` reads `window.MLConfig.email` (so `email-config.js` must
already have run), and nothing else has a cross-file dependency in the
browser. If you add a config file with its own dependency, add a comment
in `index.html` next to the `<script>` tags explaining the new ordering
constraint, the same way the existing one does.

## Who reads what

| Config file | Consumed by | For |
|---|---|---|
| `build-info.js` | `js/app.js` (`applyBrandingFromConfig`) | Version badge text |
| `app-config.js` | `js/app.js` (`applyBrandingFromConfig`) | Topbar title, document title |
| `email-config.js` | `js/email.js` | CC/BCC, subject, body, fallback names, business lines |
| `pdf-config.js` | `js/pdf.js` | The PDF's filename on disk |

`electron/emailEngine.js` and `electron/pdfEngine.js` (the actual
Outlook/PDF engines) **never** read anything in `config/`. They receive
fully-resolved strings from `js/email.js` / `js/pdf.js` and have zero
knowledge of MetLife, cover letters, or CC addresses. That separation —
Configuration → Business Rules (`js/email.js`) → Engine
(`electron/emailEngine.js`) — is the whole point of this layer: a business
string can never leak into the generic automation code.

## Why email-config.js holds data only, not functions

`js/email.js` already owned the template-resolution logic
(`buildSubject`, `buildBody`, `resolveConfig`) before this milestone.
Rather than duplicate that logic into `config/email-config.js` as a
second copy, `config/email-config.js` stays pure data and `js/email.js`
is the one place that reads a template and fills it in. This keeps
"Configuration" and "Business Rules" as two genuinely separate layers
instead of splitting one concept awkwardly across two files.

## How to change things

### Change the default CC
Edit `config/email-config.js` → `defaultCc`. Every email uses this
unless a business line overrides it (see below).

### Change the email subject or body template
Edit `config/email-config.js` → `subjectTemplate` / `bodyTemplate`.
Placeholders (`{PatientName}`, `{CRT}`, `{Provider}`) are matched
literally by `js/email.js` — keep the exact spelling, including the
curly braces, if you move them around in the template text.

### Change the PDF attachment's filename
Edit `config/email-config.js` → `attachmentNameTemplate` /
`attachmentNameFallback`. `config/pdf-config.js` re-exposes these same
two values for `js/pdf.js` automatically — you only ever need to edit
them in `email-config.js`.

### Change the Subject's fallback values
Edit `config/email-config.js` → `fallbackCustomerName` (used when Patient
Name is blank) or `fallbackProviderName` (used when Provider is blank in
the body).

### Add a future Business Line
Add a new key under `config/email-config.js` → `businessLines`, e.g.:

```js
businessLines: {
  medical: {},
  dental: {
    defaultCc: 'EgyptDentalCallCenter@metlife.com',
    subjectTemplate: 'MetLife Egypt | Dental Cover Letter | {PatientName} | CRT {CRT}',
  },
},
```

Only list the properties that business line actually overrides — every
key you omit falls back to the shared defaults above it in the same file
(`js/email.js#resolveConfig` shallow-merges the override over the base
object). No change to `js/email.js` or `electron/emailEngine.js` is
needed to add a line; today nothing in the UI lets an agent pick a
business line yet (Medical is used unconditionally), so wiring a picker
into the form is a future milestone, not a config change.

### Change the Version / Build Number
Edit `config/build-info.js` → `version` / `buildNumber` / `environment`.
The topbar badge picks this up automatically the next time the app
loads — no other file needs touching.

### Change the Application Name
Edit `config/app-config.js` → `applicationName`. This is the single
place it's defined; the topbar title and the document `<title>` both
read from it via `js/app.js#applyBrandingFromConfig`.

## What's intentionally NOT wired up yet

- `app-config.js`'s `defaultZoomPercent`, `defaultLanguage`, and `theme`
  are defined and documented but not consumed anywhere — wiring them in
  would mean touching `js/preview.js` / broader UI theming, both out of
  scope for this milestone (the brief protects the Preview module and
  says not to redesign the UI).
- `email-config.js`'s `displayMode` is documented but not read by
  `electron/emailEngine.js`, which always calls `.Display()`
  unconditionally. See the doc comment on that property for why this was
  a deliberate choice rather than an oversight.
