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
- [x] `services/classification.py`: levels, fail closed both ways (unknown content is restricted, unknown clearance is public), `visible_sql` / `visible_sql_named` (bound parameters), LLM ceiling
- [x] Session user carries `max_classification` (reloaded every request); admin `PUT /api/admin/users/{id}/clearance` (rate limited, CSRF), clearance in `GET /api/admin/users`
- [x] SQL filtering: runbook list and detail (ServiceNow runbooks only while their article is active), node runbook links (none attached without a clearance), command palette runbooks
- [x] Hidden and missing look identical (same 404 body)
- [x] AI Tutor: `article_id` (exactly one of path or article), 404 above clearance, 403 above `SERVICENOW_LLM_MAX_CLASSIFICATION` before anything is sent, article in a `<reference_article>` block, every delimiter tag escaped in article and learner text, system prompt treats reference text as data; offline provider reads the block
- [x] Audit: `knowledge_service.record_access` (confidential and restricted only), `GET /api/admin/servicenow/audit` (titles above the admin's own clearance withheld)
- [x] types.ts: Classification, Runbook source fields, AdminUser clearance, ChatResponse.source_article_id
- [x] Tests: 23

### Phase 4 review
- 219 pytest, 43 Vitest; ruff, format, bandit, pip-audit, ESLint, Prettier, tsc, build, dash check clean.
- Mutation check: removing the runbook filter, the LLM ceiling or the tag fencing each fails tests.
- Live (development, offline LLM, real logins after the scheduled sync): learner sees 30 runbooks (25 local + 5 public/internal ServiceNow), restricted runbook 404, tutor answers from an internal article and 404s a restricted one; admin sees 35, tutor refuses a restricted article with 403.
- Scope note: lesson content (roadmap nodes) is the training curriculum and stays unclassified; classification covers knowledge articles, documents, runbooks, search and tutor article context. The knowledge endpoints (Phase 5) reuse `get_visible_article` and `visible_sql`.

### Phase 5: API
- [x] `/api/knowledge`: articles (q, classification, app_number, application_id, article_type, category, node_id, paging up to 50, sort by updated or title) with facets over what the user can see; article detail (applications, documents, visible linked articles, related nodes, ServiceNow link, `llm_allowed`); lookup by KB number; applications with counts and grouped detail; document download (streamed through the backend, attachment disposition, verified type, nosniff); learner status (stale, unreachable)
- [x] `/api/admin/servicenow`: status (no secrets, instance host only in live mode), sync (background task, 202 with run id, 409 while running, rate limited), runs and one run, read only mapping, audit, manual node links (POST and DELETE, admin's own clearance applies)
- [x] Command palette search adds articles, applications and documents within clearance; ServiceNow runbooks open their article
- [x] Views and downloads of confidential and restricted content are audited
- [x] CORS allows DELETE (CSRF already covers it)
- [x] schemas.py models; types.ts and api.ts mirrors; palette icons for the new kinds
- [x] Tests: 37

### Phase 5 review
- 256 pytest, 43 Vitest; ruff, format, bandit, pip-audit, ESLint, Prettier, tsc, build, dash check, gitleaks clean.
- Mutation check: removing the clearance condition from the knowledge service or from knowledge search fails tests.
- Live: admin started a full sync over HTTP (202, run finished in the background), learner searched, downloaded a PDF (attachment, application/pdf, nosniff, real bytes), got 404 for a restricted document and 403 on an admin link endpoint.
- Found while testing: a corrupted storage path raised a ValueError (a 500 in production, refused before any file access). Now a 404.
- Decisions: `article_type` filters by purpose (runbook, sop, other), since ServiceNow's own article_type is only the format; linked articles the reader cannot see, or that were never synced, are left out of the detail entirely; applications with no visible article are hidden (404).

### Phase 6: Frontend
- [x] Shared pieces: `ClassificationBadge` (icon plus text, hint on hover, screen reader prefix), `SourceTag`, `FileIcon`, `FilterChips` (aria-pressed), `StaleBanner` (stale or unreachable, role=status), `lib/format.ts`, `lib/knowledge.ts`
- [x] `/knowledge`: debounced search, chips for classification, application, type and category (from server facets), sort, paging, all state in the URL, skeleton, empty and error states
- [x] `/knowledge/:id`: sanitised markdown body, details panel, documents with download, linked articles, related training topics, AI Tutor button (disabled with an explanation above the LLM ceiling), View in ServiceNow (new tab, noopener); 404 page that does not confirm existence; `/knowledge/kb/:number` resolves body links
- [x] `/applications` card grid and `/applications/:id` grouped into runbooks, SOPs, other and documents
- [x] Runbook Library: source filter, source tag and classification badge on every card, ServiceNow cards open their article (old `?open=` links redirect)
- [x] Roadmap drawer: Knowledge articles section (within clearance, "See all" filters the library by topic)
- [x] AI Tutor: `?article=` mode (answers from that article only, explains when the article is above the ceiling, switch back to a path)
- [x] Admin: ServiceNow panel (mock mode or connection, counts, last and next sync, Sync now and Full sync with polling, runs with error details, access audit) and a clearance select per user
- [x] Markdown: in app links use the router, external links open in a new tab with noopener noreferrer; article images limited to the column
- [x] Nav "Knowledge", footer links, palette shortcuts

### Phase 6 review
- 43 Vitest, 2 Playwright (Brave); ESLint, Prettier, tsc, build, npm audit (2 moderate, S15), dash check, gitleaks clean. No backend changes.
- Checked in Brave against an isolated stack (temp DB, mock mode, scheduled first sync): library, filters, empty state, article (light and dark), hidden article, KB number redirect, applications, runbooks, drawer, tutor with an article, admin sync now; no horizontal overflow at 390 px; only console errors are the expected 404s for the hidden article.
- Fixed after the screenshots: article details broke words in a two column list (now label above value); linked article icons wrapped; the clearance column was clipped in the wide users table (moved into the engineer cell); ServiceNow runbook dates used ISO format; "1 documents" plural.
- Note: in development StrictMode loads pages twice, so one view of a confidential article writes two audit rows; production builds write one.

### Phase 7: Tests, CI, docs
- [x] Vitest (17): classification badge per level (text, icon, hint), library chips and debounced search through the URL and API, empty state, article actions and downloads, disabled AI Tutor with its description, hidden article message, stale banner, drawer section, admin panel (runs, sync with polling, 409 conflict)
- [x] Playwright `e2e/knowledge.spec.ts` (mock mode, scheduler off): admin full sync from the panel; learner (internal) browses, filters, searches, opens an article and downloads `posting-flow.pdf`; restricted article by URL is a 404 with the same body as a missing one and shows "Article not available"
- [x] CI: backend job in mock mode, bandit over the probe, probe smoke test, gitleaks on the working tree as well as history; e2e config enables mock mode
- [x] `docs/SERVICENOW_INTEGRATION.md` (Mermaid architecture, developer instance setup, integration account permissions, env vars, mapping, sync behaviour, processing, classification, API, troubleshooting, limitations)
- [x] README, CLAUDE.md, SECURITY_REVIEW.md (S29 to S36, threat model, tool results), .env.example

### Phase 7 review
- 256 pytest, 60 Vitest, 5 Playwright (Brave); ruff, format, bandit (app and probe), pip-audit, ESLint, Prettier, tsc, build, dash check clean; npm audit 2 moderate (S15); gitleaks clean on history, the tracked tree and docs; probe passes in mock mode.
- Found by the new tests: download and "opens in a new tab" links had run together accessible names ("Downloadposting-flow.pdf"). Fixed with an explicit space before the hidden text.
- Caught before commit: the first e2e run passed although its config edit had not applied (development defaults matched, but the scheduler could have raced the admin sync). Config fixed and rerun.

## ServiceNow integration: definition of done
1. Runs fully in mock mode with synthetic data: Knowledge Library, Applications, article pages, documents, admin sync panel. Done.
2. Real instance: `scripts/servicenow_probe.py` and the client are ready; not verified, because no instance was available. Use a developer instance as described in the docs.
3. Classification enforced server side on every path, including search, runbooks, downloads and the AI Tutor. Done, with tests and mutation checks.
4. No secrets, real KB content or client identifiers committed; all tests and checks pass; documentation updated. Done.

## Motion and graphics pass (branch `feature/motion`, stacked on `feature/servicenow-knowledge`)
Plan approved 2026-10-03: CSS plus View Transitions (no animation library), drawer title to lesson heading as the shared element, transform and opacity only (progress ring stroke is the one paint only exception).

### Phase A: Motion foundation
- [x] Motion tokens in `tokens.css` (durations, easings, stagger; old `--duration-*` names alias them)
- [x] `styles/motion.module.css`: fadeIn, rise, pop, sheen skeleton, transform only `.meter` progress fill; static under reduced motion
- [x] Skeletons use the sheen (pulse keyframes removed from three modules); progress bars move from `width` to `translateX`
- [x] `lib/motion.ts`: `usePrefersReducedMotion`, `staggerStyle`, `meterStyle`, `navigateWithTransition`; `components/TransitionLink.tsx`
- [x] Page transitions: root cross fade with a small rise, topbar held still; topbar and footer links use `TransitionLink`
- [x] Empty and error states rise in once

### Phase B: Roadmap
- [x] Connectors draw in through an SVG mask whose sheet slides down (transform only, dashed lines intact); sections, topics and subtopics arrive at their share of the draw
- [x] Spine below every done topic is lit in the done colour (persistent state, not only an effect)
- [x] Completion moment: the lit connector draws to the next topic, a ring spreads from the topic just done, then from each topic it unlocked, whose icon pops in; same moment in the mobile list
- [x] `statusChange.describeChange` (pure, tested) feeds a polite status region inside the drawer: "Kafka Basics marked done. Settlement Flow unlocked."
- Kept as is: the four state treatments were already distinct (icon, text, border style, fill), so no new looping effect was added for in progress

### Phase C: Path list
- [x] Path cards rise in with a stagger; existing hover and focus depth kept
- [x] `ui/ProgressRing`: arc fills while the number counts up (stroke dash offset, the one paint only exception), progressbar semantics kept, final value under reduced motion
- [x] `ProgressLattice` header graphic: one dotted track per path lit up to the topics done (hidden from assistive technology, dropped below 720 px)

### Phase D: Lesson page
- [x] "Read full lesson" runs a View Transition: the drawer title and the lesson heading share a `view-transition-name` (`sharedTitle`), the title is passed in router state so the heading exists before the lesson loads, and the drawer preloads the lesson chunk; Back reverses it when the roadmap renders in time (otherwise a plain cross fade)
- [x] Lesson sections (`splitSections`, fence aware, tested) rise in as they scroll into view; sections already on screen are left alone, print and find in page unaffected

### Phase E: Assessment
- [x] While the model scores: a result shaped placeholder sweeping (one status region, "Evaluating your answer"), with a line saying what is happening
- [x] Result: the score counts up (tabular figures, final value in hidden text for screen readers), the bar slides in, the category pops, feedback and key points rise in order; focus moves to the result heading
- [x] Scenario quiz: verdict panel rises, its icon pops, the answer review and explanation follow in order

### Phase F: Chat
- [x] `ui/TypingIndicator` (bobbing dots, "AI Tutor is typing" for screen readers, static under reduced motion) replaces "Thinking…"
- [x] Sent messages slide in from the reading end, replies rise, a long reply's paragraphs follow 40 ms apart (all text present from the first frame)
- [x] Source chips fade in after the reply. Path mode: the path the tutor answered from plus the topics the answer names (`pathSources`; the API lists every topic in the path, which is not a citation). Article mode: the KB article

### Phase G: Analytics
- [x] "Onboarding at a glance": completion per path as concentric rings filling outer first, the average counting up in the centre, a text legend with every value; average score per path as bars that grow when scrolled into view. Built from every path's analytics with `Promise.allSettled` (a failed path shows "Unavailable")
- [x] Per path stats count up (`Ticker`, decimals kept, final value in hidden text)
- Changed from the plan: no hidden data table, because the legend and bar rows already show every value as text

### Phase H: Finish
- [x] Tests: Vitest 51 to 82 since Phase A started, covering motion helpers, ring, status change, completion moment, sections, assessment, chat, analytics, plus a view transition regression; Playwright learner flow asserts the unlock announcement
- [x] Batched visual check in Brave at 1440 and 390, light and dark, motion on and reduced motion
- [x] Detector: only pre-existing findings plus the overshoot easing, which was replaced
- [x] Finish review (fix, then a verdict pass): applied stagger order, labelled lattice, scrim cleared during the completion moment, done reads as achieved, calmer pop, header orphan; found and fixed the title morph never running (rAF paused during view transition updates); morph proven by an animation dump (node-title group 450 ms from the drawer title to the lesson heading)
- [x] DESIGN.md and `.impeccable/design.json` recorded from the shipped system; surface brief holds the direction contract
- [x] CLAUDE.md and README motion notes

### Motion pass review
- No new dependency. JS gzip across all chunks 163.2 to 167.9 kB (main chunk 16.7 to 17.3 kB), CSS gzip 24.8 to 27.7 kB.
- Open, for the user: uppercase eyebrow labels above headings on the assessment, home and certificate pages (pre-existing, the craft floor bans them); a cue for a topic unlocked below the fold; the corporate brand guide.
- Incident: a temporary worktree with a junction to `node_modules` deleted part of the real folder on removal; restored with `npm ci` (lockfile unchanged), lesson recorded.

### Roadmap motion, second pass (`/impeccable animate roadmap view`)
- [x] Completion lands as one beat: header meter, done count and percentage hold their old values and move when the lit connector reaches the next topic (`useCountUp` now continues from the number on screen and takes a delay)
- [x] "Unlocked below" cue (`roadmap/UnlockCue.tsx`): when an unlocked topic is out of view after the drawer closes, a button offers to show it; the page moves only on press, the topic is focused and rings again; retires when the topic is visible or after 8 s. Centred on phones, bottom right on wider screens
- [x] Prerequisite arcs fade in (150 ms) and out (100 ms) instead of popping
- [x] Every status change acknowledges its topic: in progress, skipped and reset pop the icon without a ring (`celebration` in `statusChange.ts`)
- [x] Reduced motion keeps the confirmation: lit connector and rings fade without spreading, icon pops become fades (`.motion-keep` opts these out of the global clamp)
- Changed from the plan: the cue appears once the drawer closes (under the open drawer it would sit beneath the scrim), and Escape does not dismiss it, because Escape closes the drawer
- Verified: 86 Vitest, Playwright 5 (learner flow now covers the cue, stable over repeated runs), visual round at 1440 and 390, light and dark, reduced motion


### Node completion delight (`/impeccable delight node completion`)
Thesis: done should feel like a clean shift handover; the work is acknowledged and the next piece is already in hand.
- [x] Handover line in the drawer after a topic is marked done: "Done. Next up: X" (or "X, now unlocked"), with "Open next topic" and the N key; one other unlocked topic is named, several are counted. It lands with the header beat and stays until another topic opens or the status changes
- [x] Next topic logic in `describeChange` (`nextUp`: the first open topic that is not locked, done or skipped, after this one, wrapping to the top); the live region adds "Next up: X."
- [x] Path complete: every other topic icon pulses once, spreading out from the topic just done (`sweepStep`); the drawer says "That completes {path}." with links to the certificate and all paths; the header keeps a "Path complete." line with a certificate link on every visit
- [x] Reduced motion: the sweep is an opacity pulse on the same timing; everything else is static
- Changed from the plan: the sweep pulses icons in place (no fade out first) and spreads from the completed topic rather than top to bottom, because a path is finished at the bottom of the map where the learner is looking; several unlocked topics are counted in the visible line to keep it short
- Verified: 94 Vitest, Playwright 5 (learner flow opens the next topic from the handover), 256 pytest, visual round at 1440 and 390, light and dark, reduced motion; sweep timing checked with `getAnimations()` (510 to 990 ms delays, done before the 1600 ms moment clears)

## Login redesign (`feature/login-redesign`, stacked on `feature/motion`)
Decisions: stack on `feature/motion`; `Retry-After` on 429 for a real countdown; no "Keep me signed in" (one fixed 8 hour session); photo A, an operator in blue light (Pexels 39071423), later replaced at the user's request by a blue server room aisle (Pexels 17323801, cropped to leave out the large rack label behind the copy).
- [x] `GET /api/public/stats` (three counts, dataset runbooks only, cached 10 minutes, 30 a minute) and `Retry-After` on every 429; `ApiError.retryAfter`
- [x] Split screen at 1024 px and wider (58/42, no scroll), tablet band with the card overlapping, phone card alone with the logo
- [x] Brand panel: tagline, value list, counting stats (hidden on failure, space reserved while loading), rotating tips with pause (next tip under reduced motion), footer line
- [x] Scene: drifting navy to violet mesh, photo at 900 and 1800 px (AVIF and WebP, phones skip it), contrast overlay, curriculum constellation that draws in, breathes and lights three done topics; parallax on wide fine pointers; paused when the tab is hidden
- [x] Card: floating labels with icons, `username` and `current-password` autocomplete, show password (`aria-pressed`), Caps Lock warning, forgot password dialog, spinner then drawn check, shake and polite status on error, 429 countdown, success hands over to home with a fade and scale view transition
- [x] Reduced motion: no drift, parallax, breathing, shake or counting
- Changed from the brief: the development banner stays gated on a development build (`import.meta.env.DEV`) rather than `APP_ENV`, which the bundle cannot see; layout snapshots are geometry assertions with screenshots attached, since pixel baselines differ between Windows and Linux fonts; the image script gained per photo widths and aspect and skips missing sources
- Verified: Vitest 104 (10 new), Playwright 12 (failed login and six layout checks added), pytest with 4 new tests, Lighthouse `/login` desktop 100/100/96 and mobile 95/100, no horizontal scroll at 150 and 200 percent zoom, main JS gzip 17.3 to 21.8 kB
