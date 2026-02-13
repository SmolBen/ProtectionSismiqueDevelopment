# Protection Sismique — Claude Reference

## Project Overview
**Protection Sismique** is a construction/engineering project management platform for a seismic protection company (protectionsismique2000.com). It handles project management, CFSS (Cold Formed Steel Stud) structural wall calculations, automated email classification, user management, bulk project verification, and report generation.

The frontend is **vanilla HTML/CSS/JS** (no framework). All pages are standalone `.html` files with associated `.js` and `.css` files. There is no build step or bundler.

---

## Architecture

### AWS Services
| Service | Purpose |
|---------|---------|
| **API Gateway** | REST API at `https://o2ji337dna.execute-api.us-east-1.amazonaws.com/dev/` |
| **Lambda** | 8 functions — main API, email classification pipeline, sync jobs (see [Lambda Functions](#lambda-functions) below) |
| **DynamoDB** | `Projects` (main), `email-classifier-projects` (project numbers from Drive), `email-classifier-corrections` (AI classification corrections), `EmailTemplates` |
| **Cognito** | Authentication — User Pool `us-east-1_EamgXZwav`, Client ID `m1q1cbgvbsg60dn1jp4q170c5` |
| **S3** | Bucket `protection-sismique-equipment-images` — equipment images, project files, report PDFs, templates, bulk-verify uploads/processed |
| **SES** | Transactional email — admin approval notifications, user welcome emails |

### Google Services
| Service | Purpose |
|---------|---------|
| **Google Sheets** | Email classification data store (the "Email_Classifications" spreadsheet) |
| **Google Drive** | Project folders — scanned by `sync-project-numbers` Lambda to extract project numbers from folder names |
| **Apps Script** (`Code.js`) | Web app middleware — exposes `getData`, `deleteRow`, `updateCell` actions for the frontend to read/write sheet data |

### External Integrations
| Service | Purpose |
|---------|---------|
| **Claude API** (Haiku 4.5) | AI extraction of project numbers (`email-classifier-test`, `backfill-project-numbers`), company name guessing from email domains (`sync-clients`) |
| **Microsoft Graph API** | Outlook email webhook subscription — `create-graph-subscription` Lambda registers for new email notifications |
| **Make.com** webhook | Report URL notifications (`hook.us1.make.com/eto1idf...`) |
| **n8n** webhook | Bulk verify notifications (`protectionsismique.app.n8n.cloud/webhook/...`) |

---

## Lambda Functions

### 1. ProtectionSeismicFunction (Main API)
**Trigger:** API Gateway (all REST routes)
**Runtime:** Node.js (ESM) with Puppeteer/Chromium layer
**Purpose:** Handles all API routes — projects CRUD, user management, report generation (seismic + CFSS), equipment, file/image uploads (presigned S3 URLs), bulk verify, email templates, wall revisions, project duplication.

**Key dependencies:** `@aws-sdk/client-dynamodb`, `@aws-sdk/lib-dynamodb`, `@aws-sdk/client-cognito-identity-provider`, `@aws-sdk/client-s3`, `@aws-sdk/s3-request-presigner`, `@aws-sdk/client-ses`, `@sparticuz/chromium`, `puppeteer-core`, `pdf-lib`, `@pdf-lib/fontkit`

**Key constants (hardcoded):**
- `TABLE_NAME = 'Projects'`
- `USER_POOL_ID = 'us-east-1_EamgXZwav'`
- `EMAIL_TEMPLATES_TABLE = 'EmailTemplates'`
- `PRIVILEGED_FLATTEN_EMAILS` — whitelist of emails allowed to sign & flatten PDFs

**Key behaviors:**
- Cold/warm start logging for performance monitoring
- Warmup ping support (`event.warmup === true`) to keep container alive
- CORS headers on all responses (including OPTIONS preflight)
- User info extracted from custom auth headers (`x-user-email`, `x-user-admin`, etc.)
- Access control: admins can access all projects, regular users only their own
- Report PDFs: generated via Puppeteer (Chromium), optionally signed, watermarked (non-admin), and flattened
- Bulk verify: upload PDFs → sign with signature image → flatten via Chromium → return processed PDFs
- Error status mapping: `Access denied` → 403, `not found` → 404, `required` → 400, else 500

---

### 2. email-classifier-test (Email Project Number Tagger)
**Trigger:** EventBridge schedule (or manual)
**Env vars:** `GOOGLE_CREDENTIALS`, `GOOGLE_SHEET_ID`, `CLAUDE_API_KEY`
**Purpose:** Tags emails in the Review sheet with project numbers. Reads columns C (Subject) and D (Content), attempts regex match of 4-5 digit numbers against known project numbers from DynamoDB (`email-classifier-projects`), falls back to Claude Haiku AI extraction, writes result to column L.

**Key logic:**
- Skips rows that already have a valid project number in column L
- Filters out years (e.g. 2024, 2025) from matches
- AI prompt instructs Claude to return ONLY the project number or "NONE"
- Clears bad existing values by writing "N/A"

---

### 3. backfill-project-numbers
**Trigger:** Manual invocation
**Env vars:** `GOOGLE_CREDENTIALS`, `GOOGLE_SHEET_ID`, `CLAUDE_API_KEY`
**Purpose:** Same logic as `email-classifier-test` — backfills project numbers on the Review sheet for historical rows that were missed. Identical code; exists as a separate function for one-off manual runs vs. scheduled processing.

---

### 4. project-number-backfill-engineering-page
**Trigger:** Manual invocation
**Env vars:** `GOOGLE_CREDENTIALS`, `GOOGLE_SHEET_ID`
**Purpose:** Backfills project numbers on the "Engineering - Existing Projects" sheet (column D). Uses regex matching against DynamoDB project numbers only — **no AI fallback**. Skips rows that already have a value in column D.

---

### 5. sync-project-numbers (Google Drive Folder Scanner)
**Trigger:** Manual or scheduled
**Env vars:** `GOOGLE_CREDENTIALS`
**Purpose:** Scans all Google Drive folders accessible to the service account, extracts project numbers from folder names (leading 4+ digit numbers), clears and repopulates the `email-classifier-projects` DynamoDB table. This is the source of truth for known project numbers used by the email tagger Lambdas.

**Key logic:**
- Queries Drive API for all folders (`mimeType='application/vnd.google-apps.folder'`)
- Regex: `^\d{4,}` at start of folder name
- Filters out year patterns (e.g. 2024)
- Deduplicates by project number
- Full table clear + rewrite on each run

---

### 6. sync-clients
**Trigger:** Manual or scheduled
**Env vars:** `GOOGLE_CREDENTIALS`, `GOOGLE_SHEET_ID`, `CLAUDE_API_KEY`
**Purpose:** Reads "From" emails from the Review sheet (column B), groups by domain, and syncs to the Client sheet. Updates existing domain rows with newly seen email addresses, appends new domains as new rows.

**Key logic:**
- For new domains: calls Claude Haiku to guess company name from domain (e.g. `steelco.com` → "Steel Co")
- Common email providers (gmail, outlook, hotmail, etc.) are labeled "Personal Email" without AI call
- Client sheet columns: Company Name (A), Email Domain (B), Emails (C)

---

### 7. sync-corrections
**Trigger:** Manual or scheduled
**Env vars:** `GOOGLE_CREDENTIALS`, `GOOGLE_SHEET_ID`
**Purpose:** Reads the Review sheet and finds rows where "Correct Category" (column I) differs from "AI Category" (column H). Saves correction records to the `email-classifier-corrections` DynamoDB table and marks the row as processed (column J = "Yes").

**Correction record schema:**
- `id`: `correction-{timestamp}-{rowIndex}`
- `from`, `subject`, `summary` (truncated to 200 chars)
- `wrongCategory`, `correctCategory`, `createdAt`

---

### 8. create-graph-subscription
**Trigger:** Manual (must be re-run every 3 days to renew)
**Env vars:** `TENANT_ID`, `CLIENT_ID`, `CLIENT_SECRET`, `USER_EMAIL`
**Purpose:** Creates a Microsoft Graph API webhook subscription to receive notifications when new emails arrive in the monitored Outlook mailbox. Authenticates via OAuth2 client credentials flow, subscribes to `users/{email}/messages` with `changeType: created`.

**Key details:**
- Webhook endpoint: `https://edaps6b39k.execute-api.us-east-1.amazonaws.com/webhook`
- Subscription expiry: 3 days (Graph API maximum for mail resources)
- Client state: `emailClassifierSecret`

---

### Shared Patterns Across Lambdas

**Google Auth:** All Lambdas that access Google Sheets/Drive use the same JWT-based service account auth pattern — build a signed JWT from `GOOGLE_CREDENTIALS` env var, exchange for an access token via `https://oauth2.googleapis.com/token`.

**Claude AI calls:** Lambdas that use Claude Haiku (`email-classifier-test`, `backfill-project-numbers`, `sync-clients`) all call `https://api.anthropic.com/v1/messages` with `claude-haiku-4-5-20251001`, low `max_tokens` (20-50), and tightly scoped prompts that request single-value responses.

**DynamoDB project number lookup:** `email-classifier-test`, `backfill-project-numbers`, and `project-number-backfill-engineering-page` all scan `email-classifier-projects` table into a `Set` for O(1) lookup.

---

## Authentication & Roles

Managed by **AWS Cognito** via `auth-helper.js` (`AuthHelper` class). Three user roles:

| Role | Access |
|------|--------|
| **admin** | Full access — all dashboards, user management, email classifications, bulk verify, CFSS |
| **regular** | Standard project dashboard, project creation/details, seismic calculations |
| **limited** | CFSS-only — redirected to `limited-cfss-dashboard.html` on login |

Role determined by Cognito attribute `custom:user_role` (fallback: `custom:is_admin`). Approval workflow uses `custom:approval_status`.

Auth headers are sent via `x-user-email`, `x-user-admin`, `x-user-firstname`, `x-user-lastname`, `x-user-company`, `x-user-domain`, `x-user-id`.

Bulk verify access is restricted to a hardcoded email whitelist (`BULK_VERIFY_ALLOWED_EMAILS`) in `auth-helper.js`.

---

## Page Map

### Core Pages
| File | Purpose | JS | CSS |
|------|---------|-----|-----|
| `auth.html` | Login/register/password reset | `auth.js` | `auth.css` |
| `index.html` | Basic project dashboard (simplified) | `scripts.js` | `styles.css` |
| `dashboard.html` | Main dashboard (admin panel, stats, search, filters) | `dashboard.js` | `dashboard.css` |
| `create-project.html` | Create new seismic project | `create-project.js` | `create-project.css` |
| `project-details.html` | Full seismic project details view | `project-details.js`, `project-details-init.js` | `project-details.css` |
| `user-management.html` | Admin user CRUD (approve, promote, demote, delete) | `user-management.js` | `user-management.css` |
| `email-classifications.html` | View/manage classified emails across sheet tabs | inline JS | `email.css` |
| `create-project-overview.html` | Create project from Google Sheets data | inline JS | inline CSS |

### CFSS Pages (admin + limited users)
| File | Purpose | JS |
|------|---------|-----|
| `cfss-dashboard.html` | CFSS project dashboard | `cfss-dashboard.js` |
| `cfss-create-project.html` | Create CFSS project | `cfss-create-project.js` |
| `cfss-project-details.html` | CFSS project details (walls, calculations, custom pages, images, reports) | `cfss-project-details.js`, `cfss-project-details-init.js`, `cfss-custom-pages.js` |
| `cfss-verify-bulk-projects.html` | Bulk PDF upload, flatten, verify, sign | `cfss-verify-bulk-projects.js` |

### Limited CFSS Pages (limited role only)
| File | Purpose | JS |
|------|---------|-----|
| `limited-cfss-dashboard.html` | Stripped-down CFSS dashboard | `limited-cfss-dashboard.js` |
| `limited-cfss-create-project.html` | Limited project creation | `limited-cfss-create-project.js` |
| `limited-cfss-project-details.html` | Limited project details | `limited-cfss-project-details.js` |

### CFSS Wall Calculation Engine
| File | Purpose |
|------|---------|
| `cfss-wall-calc-logic.js` | Core exterior wall calculation (wind loads, deflection, web crippling, moment/shear checks) |
| `cfss-wall-calc-data.js` | Stud/track property lookup tables (~187KB of structural data) |
| `cfss-wall-calc-ui.js` | Wall calculator UI rendering and interaction |

### Shared
| File | Purpose |
|------|---------|
| `auth-helper.js` | `AuthHelper` class — Cognito session management, role checks, auth headers, UI updates |
| `config.js` | Google API key (gitignored) |
| `styles.css` | Global styles and CSS variables |
| `review-tab.css` | Styles for the email review tab |

---

## API Routes

Base: `https://o2ji337dna.execute-api.us-east-1.amazonaws.com/dev`

### Projects
- `GET /projects` — list all (filtered by user role)
- `GET /projects?id={id}` — get single project
- `POST /projects` — create project
- `PUT /projects` — update project
- `DELETE /projects` — delete project (body: `{ id }`)
- `POST /projects/{id}/duplicate` — duplicate project

### Project Sub-resources
- `GET/PUT /projects/{id}/cfss-data` — CFSS calculation data
- `GET/POST /projects/{id}/cfss-report` — CFSS report generation
- `GET/POST /projects/{id}/report` — seismic report generation
- `GET/POST /projects/{id}/equipment` — equipment list
- `POST /projects/{id}/image-upload-url` — presigned S3 upload URL for images
- `POST /projects/{id}/file-upload-url` — presigned S3 upload URL for files
- `GET /projects/{id}/file-download-url` — presigned S3 download URL
- `DELETE /projects/{id}/file-delete` — delete file from S3
- `DELETE /projects/{id}/images/delete` — delete image from S3
- `GET /projects/{id}/images/sign` — presigned URL for image access
- `GET /projects/{id}/templates/sign` — presigned URL for template access
- `PUT /projects/{id}/wall-revisions` — save wall revision data

### Users
- `GET /users` — list all users
- `POST /users/approve` — approve pending user
- `POST /users/promote` — promote to admin
- `POST /users/demote` — demote from admin
- `POST /users/promote-to-regular` — promote limited → regular
- `POST /users/demote-to-limited` — demote regular → limited
- `POST /users/notify-admins` — send notification to admins

### Bulk Verify
- `POST /bulk-verify/upload-url` — get presigned S3 upload URLs for PDF files
- `POST /bulk-verify/verify` — process uploaded PDFs (sign + flatten)
- `GET /bulk-verify/download` — get presigned download URL for processed PDF

### Other
- `GET/POST/DELETE /email-templates` — email template CRUD

---

## Google Sheets — Email Classification System

### Apps Script Web App (`Code.js`)
Deployed as a Google Apps Script web app. Accessed by `email-classifications.html` via:
```
https://script.google.com/macros/s/AKfycbyn5LmnIGFtdegivHImdSWYm2ArzGm2HTqV9dsCB7ubxbwaD0yyB-uKNgr2-3J4A9DVKw/exec
```

**Actions** (passed as `?action=` query param):
- `getData` — returns all rows + headers from a given `?sheet=` name
- `deleteRow` — deletes by `emailLink`, `matchColumn`+`matchValue`, or `rowIndex`
- `updateCell` — updates a single cell by `rowIndex` + `column` (letter) + `value`

### Sheet Structure

**Review** (main triage sheet — columns A-L):
| Col | Header |
|-----|--------|
| A | Date |
| B | From |
| C | Subject |
| D | Content |
| E | Vietnamese Translation |
| F | Email Link |
| G | Summary |
| H | AI Category |
| I | Correct Category |
| J | Processed |
| K | Client |
| L | Project Number found |

**Category sheets** (emails sorted by classification — columns A-G):
`Engineering - Existing Projects`, `Price Requests`, `Existing Projects - Certificate`, `Engineering - Unknown Projects`, `New Projects`, `Spam`, `Other`

All share: Date, From, Subject, Content, Vietnamese Translation, Email Link, Summary.
Exception: `Engineering - Existing Projects` has `Project Number found` in column D (between Subject and Content).

**Client** — Company Name (A), Email Domain (B), Emails (C)
**Client List** — Single column of company names

---

## Conventions & Patterns

- **No framework** — all pages are standalone HTML with script tags. No imports, no bundler.
- **Auth pattern** — every page creates/uses an `AuthHelper` instance, calls `checkAuthentication()`, redirects to `auth.html` if unauthenticated.
- **API calls** — all use `fetch()` with `authHelper.getAuthHeaders()` for auth headers.
- **Loading pattern** — pages show a `.loading-overlay` div, remove it after init.
- **Admin elements** — hidden by default, shown via `authHelper.showAdminElements()`.
- **Limited user redirect** — `dashboard.js` redirects limited users to `limited-cfss-dashboard.html`.
- **File uploads** — two-step: get presigned URL from API, then PUT directly to S3.
- **Config** — `config.js` holds the Google API key, gitignored. `config_example.js` is the template.
- **CDN libraries** — AWS SDK, Cognito Identity JS, Font Awesome, pdf.js, pdf-lib all loaded from CDN.
- **Inline styles** — some pages (email-classifications, create-project-overview) have significant inline `<style>` blocks rather than separate CSS files.
- **No routing** — navigation is via `window.location.href` to other `.html` files with query params (e.g., `?id=`).
