# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

Primary: new L2 support engineers in their first weeks on the team, onboarding at a desk. They work through structured learning paths, check their understanding with assessments and scenarios, and ask the AI Tutor when stuck.

Secondary:
- Trainers and admins, who follow cohort progress, find the weakest topics, manage each user's clearance and run the ServiceNow sync.
- Engineers past onboarding, who come back to the Knowledge Library and Runbook Library as reference.

## Product Purpose

The Training Hub takes a new L2 engineer from day one to independently handling Fingen platform support. Success means a learner finishes every topic in all three paths (Platform Core, Transaction Flows, L2 Support Operations) and reaches the assessment threshold for the certificate. It also means trainers can see who is stuck and where.

## Positioning

A roadmap.sh style learning path tied to the team's own operational knowledge:
- Topics link directly to the approved runbooks and to the current ServiceNow knowledge articles they depend on.
- An AI Tutor answers only from the team's lessons, or from one selected article.
- Classification is enforced on the server, so learners see exactly what their clearance allows and sensitive articles never reach the LLM.

## Operating Context

- Learners move through topics in dependency order: pending, in progress, done or skipped. Skipped unlocks later topics but never counts as done.
- Assessments are open ended answers scored 0 to 10 by an LLM, plus multiple choice scenarios. Learners keep a daily streak and can continue where they left off.
- Runbooks and SOPs come from ServiceNow `kb_knowledge` through a read only sync, carrying their classification (public, internal, confidential, restricted), application numbers and names, and attached documents.
- Ctrl K (Cmd K) search covers everything the user's clearance allows.

## Capabilities and Constraints

- Status: a pilot meant to be adopted by a real support team. Today it runs on fictional Fingen content and synthetic ServiceNow fixtures (mock mode); real ServiceNow content arrives later.
- The repository is public, so it must never contain real ServiceNow data, instance URLs, credentials or client names.
- The ServiceNow integration is read only.
- Classification fails closed: unknown content is restricted and an unknown clearance is public. Hidden items look the same as missing ones.
- Terminology used in the product:
  - path
  - topic (node)
  - subtopic
  - runbook
  - SOP
  - knowledge article
  - application (APM number)
  - clearance
  - classification
  - AI Tutor
  - certificate
- User facing text uses no em dashes, en dashes or hyphenated prose compounds. `scripts/check_no_dashes.py` enforces this.

## Brand Commitments

- Name: FinGen Training Hub, with the original FinGen mark (`frontend/src/components/Logo.tsx`).
- The former client's name, logo and copyright must never be reintroduced.
- Corporate brand guidelines apply to future work. **Open:** the guide itself has not been supplied, and which guide applies is not recorded here. Do not invent its rules; ask for it before visual work that depends on it. Keep any client name out of the repository.

## Evidence on Hand

- All people, accounts, procedures and ServiceNow articles in the repository are fictional or synthetic:
  - the dataset is `backend/app/data/demo_dataset.json`
  - the fixtures are in `backend/app/integrations/servicenow/fixtures/`
- Home page photos are credited in `CREDITS.md`.
- There are no real testimonials, adoption figures or customer names. Do not fabricate them.

## Product Principles

1. Onboarding first: the learning path is the spine, and reference content serves it.
2. Show only what the user is cleared to see, and make every refusal look the same as "not found".
3. Approved and current over plentiful: runbooks and articles come from the team's sources of record, never generated.
4. The tutor stays grounded: it answers from the team's own content and treats everything it reads as data.
5. Trainers see the truth: progress and scores are decided server side.

## Accessibility & Inclusion

- Every feature must be usable from the keyboard alone, including the roadmap drawer shortcuts and the command palette.
- Every animation must respect reduced motion.
- Light and dark themes are both maintained.
- Classification is never conveyed by colour alone: a badge always pairs its text with an icon.
- Screen reader names must read correctly; this is checked in the tests.
- No formal WCAG level has been agreed yet.
