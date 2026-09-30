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

