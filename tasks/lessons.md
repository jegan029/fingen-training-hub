# Lessons

- When slicing a file between two markers, find the end marker *after* the start marker (`s.index(end, start)` or `rindex`); a generic end marker like `</div>\n  )\n}` also matches earlier components. Assert `end > start` before writing.
- Fixing a broken tsconfig can surface type errors it was hiding; budget for them before claiming the build is fixed.
- Blanket find/replace across a file also hits literals that must keep the old value (e.g. a migration's 'from' values). Scope replacements to the exact lines, then grep the file for the new value to spot unintended hits.
- Screenshots right after a theme switch or drawer open capture CSS transitions mid-way; wait ~500ms before judging colours or opacity.
- Background dev servers started with `&` inside a Bash call can die with that shell; start long-lived servers detached (PowerShell Start-Process).
- Do not mutate the user's real data during verification; use read-only calls or a test account, and restore anything changed.
- Never shortlist or ship stock photos from their page descriptions alone; view the image first (two "cybersecurity team" photos were a staged hacker set with a flag).
- Removing CSS: delete rules by selector (parse rule blocks), never by slicing between two comments; a range swept up the shared button styles. Check the diff line count matches the expected rule count.
- `vite preview` caches the dist folder it started with; restart it after a rebuild before measuring (a Lighthouse run scored the old build).
- Files written by Windows PowerShell 5 (`Set-Content -Encoding utf8`) start with a BOM, which breaks JSON parsers such as Lighthouse's `--extra-headers`; strip it or write from Node or Python.
- A `display: block` utility class on a `<td>` breaks table layout; put such classes on an inner span.
- Effects that call an imperative API with side effects on cleanup (for example `dialog.close()` firing `onClose`) misbehave under StrictMode's double mount; check what the cleanup triggers.
- Logging filters must keep `record.args` in its original shape: uvicorn's access formatter unpacks the args tuple itself, so collapsing args into `msg` breaks every access log line. Unit tests with plain loggers miss this; start the real server and make a request.
- `ruff format` can move a trailing `# gitleaks:allow` off the flagged line; put test secrets in their own short assignment.
- Do not apply code edits through Python heredoc scripts when the replaced text has backslash escapes (`\n`, `\`) or non-ASCII characters: the escaping changes between bash, Python and the file, or Windows reads the script as cp1252, and the edit silently fails or writes real newlines. Use the Edit tool for those.
- When a test inspects an LLM prompt, record the system prompt and the user prompt separately: the system prompt names the delimiter tags, so counting or splitting on tags over both gives false failures.
- When a scripted multi file edit fails part way, check which files actually changed before running tests: a Playwright run passed while its config edit had not applied, only because development defaults happened to match. Passing for the wrong reason hides flakiness (here, a scheduler racing the test).
- Screen reader only text after visible text needs an explicit `{' '}` before the hidden span; a space inside the span is dropped from the accessible name ("Downloadposting-flow.pdf"). Assert link names in tests.
