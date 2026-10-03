---
version: 1
slug: "frontend-src-routes-moduleview-tsx"
primary_target: "frontend/src/routes/ModuleView.tsx"
related_targets: ["frontend/src/routes/RoadmapViewer.tsx","frontend/src/routes/NodeContentPage.tsx","frontend/src/routes/AssessmentPage.tsx","frontend/src/routes/ChatAssistant.tsx","frontend/src/routes/AnalyticsDashboard.tsx"]
---

Scope: motion and graphics pass across the learner console (roadmap, path list, lesson, assessment, AI Tutor, analytics). Mode: Operate (Read for the lesson page).

Audience and job: new L2 engineers onboarding; trainers reading cohort analytics. Motion shows state and progress only.

## Direction contract
THESIS: motion is the learner's progress made visible; things draw, fill and light up only when they represent state or progress. Refuses the category default of scattered hover and fade in effects.
OWN-WORLD: inherited, unchanged: navy and electric blue accent, success green, Playfair Display headings, Inter UI, token set in frontend/src/styles/tokens.css; motion tokens --motion-*, --ease-out, --ease-in-out, --ease-emphasis, --stagger-step; shared classes in styles/motion.css.
STORY: the roadmap draws itself; marking a topic done lights the spine to the next topic, which unlocks and is announced; path cards fill to real progress; answers and scores arrive in a readable sequence.
FIRST VIEWPORT: roadmap spine draws top to bottom over --motion-draw while topics arrive as the line reaches them; the completion moment is the signature interaction.
FORM: none rolled. Extension of an established world: new-work "Extend an existing surface" runs no concept round, and the user confirmed the approach (CSS plus View Transitions, drawer title to lesson heading) in the plan round on 2026-10-03. No seed key.
FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance

Unresolved: corporate brand guide not supplied (PRODUCT.md); eyebrow labels on assessment and home pages predate this build and were left as they are.
