# Screenshot capture log

All ten screenshots are **captured from the real running product** via
`node scripts/capture-screenshots.mjs` (Phase 11). The script boots the compiled
production server on port 3199, drives a real Chrome, and refuses to write a file
whose rendered `dir` does not match the requested locale — so a blank or
wrong-direction page cannot be captured and passed off as evidence. Nothing here
is a mockup, and no AI output is presented as live provider output.

Capture environment: `NODE_ENV=production`, compiled client, seeded database
(only the documented demo accounts/submission — no secrets or private data),
browser = the installed Chrome via `playwright-core`.

| File | Viewport | Route | Demo data / state | Audience and what it shows |
| --- | --- | --- | --- | --- |
| `01-home.png` | 1440x900 | `/` | anonymous visitor | Visitors: realistic job practice and the evidence model. |
| `02-catalog.png` | 1440x900 | `/simulations` | anonymous visitor | Learners: comparing both simulations and filtering by skill. |
| `03-novashop-details.png` | 1440x900 | `/simulations/novashop-mobile-checkout` | `learner@worksim.dev` | Learners: the frontend role, brief, requirements and materials. |
| `04-novashop-workspace.png` | 1440x900 | workspace (after **Start**) | active NovaShop attempt | Learners: the buggy component source, task fields and the team inbox. |
| `05-novashop-feedback.png` | 1440x900 | `/evidence/:submissionId` | seeded learner's completed submission | Learners: deterministic evaluation plus the AI review section (its state is rendered as stored — READY or the neutral unavailable state). |
| `06-marketflow-workspace.png` | 1440x900 | MarketFlow workspace | active MarketFlow attempt | Learners: the synthetic sales dataset and the analysis fields. |
| `07-mentor-review.png` | 1440x900 | `/mentor/:submissionId` | `mentor@worksim.dev`, a real queued submission | Mentors: the submitted work, AI context and the human review form. |
| `08-employer-evidence.png` | 1440x900 | `/employer/evidence/:submissionId` | `employer@worksim.dev`, consenting learner | Employers: a consenting candidate's work, evaluation, skills and approach. |
| `09-mobile-workspace.png` | 390x844 | workspace (pane tabs) | active attempt | Learners: the workspace on a phone viewport (no horizontal overflow). |
| `10-arabic-interface.png` | 1440x900 | `/evidence/:submissionId` with `dir=rtl` | `learner@worksim.dev`, Arabic locale | Arabic speakers: a core workflow in Arabic with correct RTL direction. |

Notes recorded during capture, not hidden:

- Shot 05's AI section reflects **stored** feedback for that submission. The
  seeded demo submission carries a cached review stamped `model: "seed:demo"`
  (see `docs/OUT-OF-SCOPE.md`); a submission with no stored review renders the
  neutral "not available" state and is captured as such rather than dressed up.
- Shot 10 is asserted to have `document.documentElement.dir === 'rtl'` in the
  session that produced it; an earlier bug in the capture script (writing the
  wrong `localStorage` key) produced a duplicate/wrong shot and is why that
  assertion exists.
- Screenshots are regenerated automatically; re-running the script overwrites
  these files, so they should be refreshed whenever the UI changes.

