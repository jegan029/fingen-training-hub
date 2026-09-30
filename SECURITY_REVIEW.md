# Security Review

Scope: FastAPI backend (`backend/app`), React frontend (`frontend/src`), dependencies, configuration and git history.
Branch: `feature/roadmap-redesign-and-hardening`. Reviewed 2026-09-29.

Status values: **Fixed**, **Fixed in Phase N** (scheduled), **Accepted** (with reason), **Needs decision**.

## Findings

| ID | Severity | Location | Description | Fix | Status |
|----|----------|----------|-------------|-----|--------|
| S1 | Critical | all routers, `main.py` | No server-side authentication. Every API route, including `/api/admin/users` (names, emails and progress of every user), was callable anonymously. | Login issues an HS256 JWT in an `httpOnly`, `SameSite=Strict` cookie (`Secure` outside development). `get_current_user` is applied at router level to every route except `/api/auth/login` and `/api/health`; `require_admin` guards `/api/admin/*` and `/api/analytics/*`. The user and role are reloaded from the DB on every request. Added `/api/auth/me` and `/api/auth/logout`. | Fixed |
| S2 | Critical | `frontend/src/context/AuthContext.tsx`, `App.tsx` | Admin access was decided in the browser from `role` in `localStorage` (`ss_auth_user`). Editing it granted the admin UI. | The frontend loads the user from `/api/auth/me` and stores nothing in `localStorage` (any legacy key is deleted). UI role checks are cosmetic; the server enforces permissions. | Fixed |
| S3 | Critical | `progress_service.py`, `routers/progress.py`, `api.ts` | IDOR: user identity was hardcoded (`self.user_id = 1`, `DEFAULT_USER_ID`) or taken from the request body (`user_id` in assessment, scenario, chat and progress payloads), so any caller could read or write any user's data. | Removed `user_id` from every request schema and `DEFAULT_USER_ID`. The user always comes from the session. Progress, assessments and scenario attempts are per user. | Fixed |
| S4 | High | `db.py`, `routers/auth.py` | Passwords stored as unsalted SHA-256. | argon2id via `argon2-cffi` with constant-time verification, plus a dummy-hash check for unknown emails so timing does not reveal which accounts exist. Migration `m002` deletes every non-argon2 hash from existing databases. | Fixed |
| S5 | High | `db.py`, `LoginPage.tsx` | Hardcoded default credentials (`admin123`, `learner123`) in source and shown on the login page. | Login accounts are seeded only when `APP_ENV=development`, with passwords from `SEED_ADMIN_PASSWORD` / `SEED_LEARNER_PASSWORD` or generated and printed once. The login page no longer shows passwords, and its demo-account box only exists in development builds. A test asserts the old passwords are not in the source. | Fixed |
| S6 | High | `routers/auth.py` | No brute-force protection on login. | `slowapi` limit of 5 per minute per IP. Per-email lockout for 15 minutes after 10 failures, stored in `login_failures`. The error message stays generic. | Fixed |
| S7 | Medium | `schemas.py` | Login accepted any string as email and unbounded passwords. | `EmailStr`, and password length capped at 128 characters. | Fixed |
| S8 | High | `NodeContentPage.tsx` (4), `HomePage.tsx` (2) | Stored XSS: node content was converted to HTML with regex and injected with `dangerouslySetInnerHTML`. There were six uses, not the four originally reported. | New `components/Markdown.tsx` (`react-markdown` + `remark-gfm` + `rehype-sanitize` default schema). The HomePage strings are plain JSX. AI Tutor replies use the sanitised renderer; assessment and scenario feedback are plain React text. Zero `dangerouslySetInnerHTML` remain. | Fixed |
| S9 | High | `llm_service.py`, `schemas.py`, `routers/chat.py`, `routers/assessment.py` | LLM abuse: unbounded input, no rate limit (cost exposure), and user text concatenated straight into prompts (prompt injection). | Chat messages capped at 2000 characters and answers at 4000 (422 above that). Per-user limit of 20 per minute on chat and evaluate. Learner text sits inside `<learner_input>` tags, with a server-side system prompt telling the model to treat it as data, and closing tags in the input are escaped. | Fixed |
| S10 | Medium | `llm_service.py` | LLM evaluation stored unvalidated. | Score clamped to an integer from 0 to 10. Category checked against an allowlist (Excellent, Good, Partial, Incorrect). Feedback and key points are length-capped. | Fixed |
| S11 | Medium | `llm_service.py` | Model name hardcoded (`gpt-4o-mini`). | Configurable via `LLM_MODEL`. | Fixed |
| S12 | Medium | `llm_service.py`, `main.py` | Raw exception text, which can include the upstream URL or response, could reach clients. | LLM errors are logged server side and clients get a generic fallback. A global exception handler returns `Internal server error` for anything unhandled. | Fixed |
| S13 | Medium | `requirements.txt` | Outdated pins (`fastapi 0.111.1`, `uvicorn 0.23.2`, `requests 2.31.0`, `python-multipart 0.0.7`). | Upgraded to current releases (FastAPI 0.142, uvicorn 0.54, requests 2.34, pydantic 2.13). `python-multipart` removed as unused. Dev tools moved to `requirements-dev.txt`. | Fixed |
| S14 | Medium | `frontend/package.json` | `npm audit` showed 10 vulnerabilities (4 high) in Vite 5 and its tooling. | Upgraded Vite to 8 and `@vitejs/plugin-react` to 6, then ran `npm audit fix`. | Fixed |
| S15 | Low | `react-router-dom` 6.x | 2 moderate advisories (GHSA-337j-9hxr-rhxg) in React Router's SSR hydration (`deserializeErrors`). | This app is a client-only SPA and never uses SSR hydration, so the code path is unreachable. The fix requires a breaking upgrade to v7. | Accepted |
| S16 | Medium | `main.py` | No security headers. | Middleware on every API response: `Content-Security-Policy: default-src 'none'; frame-ancestors 'none'`, `X-Content-Type-Options: nosniff`, `Referrer-Policy`, `X-Frame-Options: DENY`, `Permissions-Policy`, `COOP`, `Cache-Control: no-store`, and HSTS over HTTPS. The page itself gets a self-only CSP (no inline scripts or styles) under `vite preview`; in production the nginx container (`frontend/nginx.conf`) sends the same CSP and headers. | Fixed |
| S17 | Medium | `main.py` | CORS origins hardcoded; all methods and headers allowed. | `CORS_ORIGINS` env var. Methods limited to `GET`, `POST`, `PUT`; headers to `Content-Type`, `X-Requested-With`. | Fixed |
| S18 | Medium | (new) | No CSRF protection once cookies carry the session. | `SameSite=Strict` cookie plus middleware that rejects `POST`/`PUT`/`PATCH`/`DELETE` on `/api/*` without `X-Requested-With: fetch`. | Fixed |
| S19 | Medium | `config.py` | No signing secret. | `APP_SECRET_KEY` must be at least 32 bytes, otherwise the app refuses to start. Only `APP_ENV=development` falls back to a random per-process key, with a warning. | Fixed |
| S20 | Low | `main.py` | `/docs`, `/redoc` and `/openapi.json` always exposed. | Disabled unless `APP_ENV=development`. | Fixed |
| S21 | Low | `main.py`, `db.py` | Deprecated `@app.on_event("startup")` and naive `datetime.utcnow()`. | Lifespan handler; `datetime.now(timezone.utc)`. | Fixed |
| S22 | Low | services and routers | Connections were opened and closed by hand and leaked on exceptions. | A single `db.connection()` context manager (commit, rollback, always close) used everywhere. Every query is parameterised. The one formatted statement is `PRAGMA user_version = {int}`, because PRAGMA cannot take bound parameters. `bandit` reports no issues. | Fixed |
| S23 | Medium | `HomePage.tsx` | Seven images hotlinked from `images.unsplash.com` leak visitor data to a third party and need a CSP exception. | Replaced with self-hosted AVIF/WebP photos (Pexels licence, credited in `frontend/src/assets/images/CREDITS.md` and the in-app Image credits page) and original SVGs. The page CSP is now `img-src 'self'`; a production-build check found zero third-party requests. | Fixed |
| S24 | Low | `frontend/index.html` | Google Fonts loaded from a third party; blocked by a self-only CSP. | Self-hosted via `@fontsource/inter` and `@fontsource/playfair-display`. | Fixed |
| S25 | Low | `.gitignore`, git history | Secrets hygiene. | `.env` is ignored. gitleaks 8.30.1 over all branches (3 commits): **no leaks**. Working-tree scan: real keys only in `backend/.env` (ignored, never committed); third-party fixtures in `.venv` (ignored); one test-only secret in `tests/conftest.py`, marked `gitleaks:allow`. | Fixed |
| S26 | Info | `frontend/tsconfig*.json` | `npm run build` failed on a tsconfig error, which also hid type errors (missing `vite-env.d.ts`, untyped API helpers). | Fixed the config and typed every API helper. | Fixed |
| S27 | Low | `Certificate.tsx` | Certificate eligibility is decided entirely client side. | `GET /api/certificate` decides eligibility server side: every node done (skipped does not count) and the best score per node averaging at least `CERT_MIN_AVG_SCORE` (default 7). The page only renders what the API returns. | Fixed |
| S28 | Medium | `docker-compose.yml`, `frontend/nginx.conf`, `backend/Dockerfile` | Found in Phase 6. Behind a reverse proxy every request arrives from the proxy's IP, so per IP login limits would become one shared bucket; appending to `X-Forwarded-For` would instead let clients spoof their IP. | nginx overwrites `X-Forwarded-For` with `$remote_addr`; uvicorn trusts proxy headers, and the backend port is not published, so only nginx can reach it. Verified: the backend logs the client address, not the nginx container's. | Fixed |
| B1 | Medium | see Brand audit | Client name, logo and copyright in a public repository. | Applied the FinGen rebrand (below): original logo component (`components/Logo.tsx`) replaces all three copied logos, neutral copy, `@fingen.demo` emails, and dataset wording. Migration `m003` renames existing demo emails; dataset changes reach existing databases through the startup content sync. | Fixed |

## Tool results

| Tool | Scope | Result |
|------|-------|--------|
| `pip-audit -r requirements.txt` | runtime Python deps | No known vulnerabilities |
| `bandit -r app` | backend source | No issues (0 low, 0 medium, 0 high) |
| `npm audit` | frontend deps | 2 moderate (S15, accepted); 0 high, 0 critical |
| `gitleaks git --log-opts=--all` | full git history | No leaks (3 commits) |
| `pytest` | `backend/tests/test_security.py` | 39 passed |
| `vitest` | `frontend/src/test/xss.test.tsx` | 2 passed |

## Brand audit (1.7): applied at the start of Phase 2

An earlier version used a third party's company name, logo and copyright line in the UI, API metadata, demo emails and lesson content. All of it was replaced with original FinGen branding (`components/Logo.tsx`, `@fingen.demo` accounts, neutral wording in the dataset), and migration `m003` moves existing demo accounts to `@fingen.demo`. The repository history was restarted so the earlier branding is not published.
