# Todo: enhancement brief

Plan: see approved plan (Phases 1 to 6). Branch: `feature/roadmap-redesign-and-hardening`.

## Phase 1: Security review and fixes
- [x] Fix tsconfig so `npm run build` passes
- [x] Settings: APP_ENV, APP_SECRET_KEY, CORS_ORIGINS, seed password vars; remove DEFAULT_USER_ID
- [x] DB: connection() context manager, PRAGMA user_version migrations, timezone aware datetimes
- [x] Auth: argon2id, JWT httpOnly cookie, get_current_user / require_admin, /auth/me, /auth/logout
- [x] CSRF header check on state changing requests
- [x] Remove client supplied user_id everywhere; per user progress/assessments
- [x] Seed accounts only in development, passwords from env or generated
- [x] Login rate limit + lockout, EmailStr, password length
- [x] LLM: input limits, per user rate limits, delimited user input, allowlisted category, no raw errors
- [x] Security headers, CORS from env, docs off in production, lifespan handler
- [x] Frontend: AuthContext via /auth/me, no role in localStorage, api.ts without user_id
- [x] XSS: Markdown component with rehype-sanitize; zero dangerouslySetInnerHTML
- [x] Self host fonts
- [x] Dependency upgrades, pip-audit, npm audit, gitleaks, bandit
- [x] SECURITY_REVIEW.md incl. brand audit (rebrand awaits approval)
- [x] pytest security tests + Vitest XSS test
- [x] Phase gate: backend runs, build passes, tests pass, commit

### Phase 1 review
- 39 backend tests + 2 Vitest tests pass; `npm run build` clean; pip-audit/bandit/gitleaks clean; npm audit 0 high/critical.
- Deviation: legacy SHA-256 hashes are deleted by migration (not rehashed on login) so `admin123` stops working.
- Analytics is now cohort level (admin only) instead of user 1's progress.
- Waiting on: rebrand decision (SECURITY_REVIEW.md, Brand audit).

## Phase 2: Roadmap redesign
- [x] FinGen rebrand (approved), startup content sync
- [x] Runbooks into dataset + API, approved node links (43)
- [x] Subtopics from `## ` headings at seed time (+ tests)
- [x] Node status (pending/in_progress/done/skipped), migration from `completed`, PUT endpoint, lock rules
- [x] Tokens, light/dark theme, toggle; CSS Modules for new components
- [x] Roadmap canvas (hand-rolled layout), drawer, legend, mobile list/bottom sheet, keyboard nav
- [x] Paths listing grouped Role/Skill based with lucide icons
- [x] Runbook deep links, chat prefill
- [x] Tests: 65 pytest, 26 vitest; build clean; audits clean
- [ ] Remaining inline-style pages migrate to CSS modules as they are reworked (Home in Phases 3/4, others in Phase 6)

### Phase 2 review
- Prerequisite arcs only for the active node: drawing all needed up to 9 lanes and overlapped subtopics.
- Cross-path prerequisite (node 20 needs node 5) shown in the drawer with a link, not on the canvas.
- Locked nodes: readable; only Reset allowed until prerequisites are done or skipped (server enforced, 409).
## Phase 3: Home page images
- [x] Shortlist with verified licences; picks confirmed (hero, L2, analytics revised after viewing the photos)
- [x] 4 Pexels photos cropped and converted to AVIF/WebP at 400/800/1200 (all under 65 KB)
- [x] 3 original SVGs: hero data flow, transaction flow, AI tutor
- [x] `<picture>` with srcset/sizes, lazy loading (hero eager), explicit width/height, alt text
- [x] CREDITS.md, /credits page, footer link; CSP img-src 'self'; favicon; removed stray public/index.html
- [x] Tests: 31 vitest; production build under CSP: no external requests, no console errors

## Phase 4: Home page animation
- [x] Pure CSS + useInView/useCountUp hooks (no animation library)
- [x] Hero roadmap preview: spine draws, topics pop in, two turn done
- [x] Staggered headline entrance, count-up stats strip, scroll reveal cards/tile, card hover and focus lift + image zoom
- [x] Progress ring animates to the real value
- [x] prefers-reduced-motion: everything static and visible (verified in Brave)
- [x] Home page moved to a CSS module (follows dark mode); white CTA button contrast fixed
- [x] Fixed CLS 0.58 → 0.014: topbar/footer hidden until the auth check resolves
- [x] Lighthouse (production preview, logged in): mobile 90/100/100 (3 runs), desktop 100/100/100
- Skipped optional ambient background motion: it would need a loop longer than 700ms; the static hero art already covers it.

## Phase 5: Remove dashes
- [x] scripts/check_no_dashes.py (dataset display fields, TSX/TS text, backend strings, index.html; skips code, SQL, comments, list markers) + pytest wrapper
- [x] Dataset: 284 dashes removed (84 term colons, 6 ranges to "to", 40 label rules, 151 sentence rewrites); 228 compounds rewritten
- [x] UI: 4 dashes, 11 compounds
- [x] Verified: 75 code/SQL spans byte identical; slugs unchanged; 0 em/en dashes in the API; lesson and runbook pages checked in Brave

## Phase 6: Additional improvements
- [x] 6.2 Ctrl+K command palette over `GET /api/search`
- [x] 6.7 `GET /api/progress/summary` (streak, continue where you left off) + server side `GET /api/certificate` (CERT_MIN_AVG_SCORE)
- [x] 6.8 Admin "weakest topics" table (demo persona scores seeded in development)
- [x] 6.9 ErrorBoundary, skeletons, empty and error states, 404 page
- [x] 6.10 React.lazy per route + bundle size report
- [x] Migrate remaining inline-style pages to CSS modules (dark mode)
- [x] 6.6 LLM provider abstraction (openai_compatible, anthropic, offline)
- [x] 6.4 ruff, ESLint, Prettier, pre-commit (formatting in its own commit)
- [x] 6.3 Playwright e2e + GitHub Actions CI
- [x] 6.5 Dockerfiles (non-root backend, nginx frontend with full CSP + gzip), docker-compose
- [x] README.md, CLAUDE.md, .env.example, SECURITY_REVIEW.md
- [x] Phase gate: backend runs, build passes, all tests pass, commit

### Phase 6 review
- Tests: 89 pytest, 43 Vitest, 2 Playwright (Brave, isolated backend with the offline provider). ruff, ESLint (0 warnings), Prettier, tsc clean. pip-audit, bandit, gitleaks (history) clean; npm audit: only the known react-router moderate (S15).
- Bundle: one 420 kB JS file (128 kB gzip) became a 211 kB initial load (70 kB gzip); react-markdown (48 kB gzip) now loads only with lesson, chat and assessment pages.
- Lighthouse, home, production preview: mobile 93/100/100 (3 runs, was 90), desktop 100/100/100.
- Docker: both images built and run; containers non-root; CSP, gzip and login verified through nginx.
- New finding S28 (client IP behind the reverse proxy) fixed: nginx overwrites X-Forwarded-For.
- Anthropic provider is covered by request shape tests only; no Anthropic key was available for a live call. The NVIDIA path was verified live after the refactor (chat and a JSON evaluation).
- The GitHub Actions workflow has not run yet (nothing pushed).

## ServiceNow knowledge integration (branch feature/servicenow-knowledge)
Plan approved 2026-10-02. Decisions: build a dash normaliser sharing the checker's patterns; local content is `internal` (fail closed applies to synced content only); the probe moves to Phase 2; the AI Tutor sends only the selected article. Field names in `mapping.yaml` are assumptions until a sanitised sample payload is provided.

### Phase 1: Mapping and config
- [x] `integrations/servicenow/settings.py`: every SERVICENOW_* env var, SecretStr secrets, enabled + mock mode by default in development only
- [x] `mapping.yaml` + Pydantic models (extra forbidden, safe field names, per mode application blocks, fail closed classification, type matching, document allowlist, node links)
- [x] Display values: one `sysparm_display_value` per request (`all` when any field needs a display value), read per field
- [x] Mapping validated in the lifespan when enabled; an invalid mapping stops startup
- [x] `.env.example`, `.gitignore` (kb_documents), PyYAML pinned
- [x] Tests: 24 (mapping, settings, startup)

### Phase 1 review
- 113 pytest, 43 Vitest; ruff, format, bandit, pip-audit, ESLint, Prettier, tsc, build, dash check clean; npm audit unchanged (2 moderate, S15). gitleaks: history clean; working tree hits only in ignored `.venv` and `backend/.env` (S25).
- Backend started in development mode (mock default): health ok, runbooks still 401 without a session.
- Deviation: `sysparm_display_value` is request wide in the Table API, so "per field" is implemented as `read: value | display | both` on each field.
- No ServiceNow access yet, so the mapping follows the standard kb_knowledge schema (follow up commit): `latest=true` in the filter, applications from `cmdb_ci` (business applications, APM numbers), classification from a custom field with `category` and `knowledge_base` as alternatives (no standard field exists), runbook/SOP by category name only, linked articles from body links. Confirm later with the probe on a developer instance.
- Consequence for Phase 3: a new article version is a new record (new sys_id, same KB number), so articles are keyed by KB number and the stored sys_id is updated.

### Phase 2: Client, mock mode, probe
- [x] httpx client (timeouts, TLS on, no redirects, every request pinned to the instance host, pagination, sysparm params), attachments list and streamed download with a size cap
- [x] SSRF allowlist (https only, no credentials, port, path or IP literal), OAuth (client credentials or password grant, cached, refresh token, one retry on 401) and basic (development only)
- [x] Backoff with jitter, Retry-After (seconds or HTTP date, capped at 60 s), circuit breaker (5 failed calls, half open after 5 min); 4xx is a config error, not an outage
- [x] Log redaction filter (headers, form and JSON secrets, configured secret values, tracebacks), installed at startup
- [x] Mock client + synthetic fixtures (15 records: 13 in scope, 1 retired, 1 in another knowledge base; 4 apps; all levels plus an unmapped one; PDF, DOCX, PNG, TXT and an exe disguised as a PDF)
- [x] scripts/servicenow_probe.py (field states, body length and hash only)
- [x] Tests: 44 (respx)

### Phase 2 review
- 159 pytest, 43 Vitest; ruff, format, bandit (app and the probe), pip-audit, build, dash check clean; gitleaks clean on history and the new code.
- Mutation check: disabling the host allowlist, the redirect refusal or secret redaction each fails tests.
- The live server run found a real bug the unit tests missed: the redaction filter cleared `record.args`, which broke uvicorn's access log. Fixed (args redacted in place) with a regression test using uvicorn's own formatter.
- Fixture knowledge base sys_ids equal the placeholders in mapping.yaml, so mock mode works with the shipped mapping.
- Not verified: a live instance (no access). The probe is ready for a developer instance.

### Phase 3: Data model, processing, sync
- [x] m006: applications, kb_articles, article_applications, article_documents, sync_runs, article_nodes, kb_access_log; runbooks.source/kb_article_id/classification; users.max_classification (existing admins get restricted); ServiceNow runbook ids = 100000 + article id, dataset ids guarded below that
- [x] services/prose.py: the checker's patterns moved here (checker imports them) plus `normalise_dashes` (ranges to "to", labels to colons, separators to commas, compounds; code, SQL and URLs masked and restored byte for byte)
- [x] HTML to markdown: nh3 allowlist (scripts, iframes, handlers, unsafe schemes gone), markdownify with image and link rewriting (synced attachments only, KB links to `/knowledge/kb/KB...`), final unsafe link pass; summary from meta_description or first paragraph
- [x] Sync engine: incremental (>= watermark, hash skip), full (retires missing, unpublished, expired; never deletes), keyed by KB number, applications from article fields, cmdb_ci or m2m, documents (allowlist, declared type, size, magic bytes, sha256 storage next to the DB), runbook projections, node links from mapping (manual kept), per article failure isolation, one run at a time (process lock + DB running guard), interrupted runs closed at startup
- [x] APScheduler BackgroundScheduler in the lifespan (first incremental 15 s after start, interval, nightly full); SERVICENOW_SCHEDULER=false for tests
- [x] Tests: 37

### Phase 3 review
- 196 pytest, 43 Vitest; ruff, format, bandit, pip-audit, ESLint, build, dash check, gitleaks (history and new code) clean.
- Mutation check: removing the dash normaliser, the magic byte check or retirement each fails tests.
- Live run (development, mock): the scheduled first sync created 12 articles, stored 5 documents, rejected the disguised executable, no logging errors.
- Tests found a real gap: a markdown link target with parentheses (`javascript:alert(1)`) escaped the final link pass. Fixed.
- Deviations: (1) no second nh3 pass over the markdown: it would corrupt code such as `a < b`; react-markdown renders no raw HTML and rehype-sanitize still runs, and the server drops unsafe link targets. (2) Magic bytes checked in code (PDF, PNG, JPEG, OOXML zip directory, UTF-8 text) instead of the `filetype` package: fewer dependencies, and Office files need the zip directory check anyway. (3) KB links point to `/knowledge/kb/KB...` (resolved by number), so link order in a run does not matter. (4) Retired articles' runbook projections are deleted (they are derived rows); the articles themselves are only deactivated.
- Known limit: attachments added to an article without the article itself changing are picked up by the nightly full sync, not the incremental one.

### Phase 4: Classification enforcement
- [ ] Clearance per user, SQL filtering on every path, 404 for hidden, LLM ceiling, delimited article context, audit log
- [ ] Tests

### Phase 5: API
- [ ] /api/knowledge/* and /api/admin/servicenow/*, schemas and types.ts
- [ ] Tests

### Phase 6: Frontend
- [ ] Knowledge Library, article page, applications, runbook source filter, drawer section, palette, admin panel, states

### Phase 7: Tests, CI, docs
- [ ] Vitest, Playwright (mock mode), CI additions, docs/SERVICENOW_INTEGRATION.md, README, CLAUDE.md, SECURITY_REVIEW.md
