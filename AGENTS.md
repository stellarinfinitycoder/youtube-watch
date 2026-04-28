# AGENTS.md

Purpose: practical guardrails for AI/code agents working in this repository.

## Language

- Write all code, comments, documentation, commit messages, and file content in English.

## Scope

- App: React + TypeScript + Ant Design (Vite).
- API routes: `api/*` (Vercel/server-side).
- Keep Vercel serverless function count compatible with the Hobby plan. Prefer consolidating related endpoints through existing dispatcher functions instead of adding deployable files under `api/`.
- Keep tests outside `api/` so Vercel does not treat them as functions.
- Main UI entry is `src/App.tsx`; keep changes modular and avoid unnecessary growth in this file.

## Environment

- Copy `.env.example` to `.env` and set required keys.
- Never commit secrets from `.env` or production credentials.
- Use Node/npm versions already working in this repo; do not introduce toolchain churn unless explicitly requested.
- For clean installs and CI-like dependency install flows, use `npm ci`.
- Use `npm install` only when dependency changes are intentional and explicitly requested.

## Allowed Changes

- Read the relevant existing code paths before editing; extend current patterns instead of introducing parallel ones.
- Prefer targeted edits over large refactors.
- If multiple patterns exist, follow the one nearest to the touched area.
- Preserve existing UX patterns and naming conventions unless the task explicitly asks for redesign.
- Do not remove or rename public routes/endpoints without updating callers and docs.
- Do not add or upgrade dependencies unless explicitly requested.
- For Ant Design changes, prefer documented props, tokens, and composition before custom CSS overrides.

## Validation Before Hand-off

Run, in order:

1. `npm run lint`
2. `npm run test:unit`
3. `npm run test:smoke` (only when UI flows/selectors changed)
4. `npm run build` (for build/config/runtime-impacting changes)

If a step is skipped, state exactly why.

## Testing Expectations

- Add/update tests for behavior changes:
- Unit/API logic: `src/**/*.test.ts*` or `src/api/*.test.ts`.
- UI behavior: `src/**/*.test.tsx`.
- End-to-end regressions: `tests/smoke.spec.ts` when user-critical flows change.

## Safety Rules

- Do not perform destructive git commands (`reset --hard`, force pushes, history rewrites) unless explicitly requested.
- Do not revert user-authored unrelated local changes.
- Keep commits focused and atomic when asked to commit.
- GitHub remote is `origin` at `https://github.com/stellarinfinitycoder/youtube-watch.git`.
- Do not push, deploy, or trigger release workflows unless explicitly requested.

## When Stuck

- If blocked after 2 focused attempts, stop and report: blocker, what was tried, and 1-2 concrete next options.

## Docs Usage

- For architecture-sensitive tasks, consult `PROJECT_ARCHITECTURE_SHORT.md`.
- For code-writing or code-modifying tasks, consult `CODE_CONVENTIONS_SHORT.md`.
- For project-specific durable notes and previously established UI or validation decisions, consult `MEMORY.MD`.

## Instruction Priority

Follow this order of precedence:

1. Direct user request
2. Repo guardrails (`AGENTS.md`)
3. `PROJECT_ARCHITECTURE_SHORT.md`
4. `CODE_CONVENTIONS_SHORT.md`
5. `MEMORY.MD`
6. Nearest local code pattern

## Handoff Format

- Summarize what changed and why.
- List touched files.
- Report command results (pass/fail) for validation steps.
- Mention residual risks or follow-up work if relevant.
