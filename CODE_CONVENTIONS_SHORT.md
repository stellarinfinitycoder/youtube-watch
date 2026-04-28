# CODE_CONVENTIONS_SHORT.md

Short reference coding conventions for this repository.
For setup/deploy basics, see [README.md](./README.md).

## General Style

- TypeScript-first implementation.
- Use explicit types on exported APIs and shared contracts.
- Prefer small, intent-named functions over large mixed-responsibility blocks.
- Prefer existing naming and local module patterns in the nearest affected area.

## React Conventions

- Use function components and hooks.
- Use `useMemo` for non-trivial derived values.
- Use `useEffect` for side effects with guarded dependency lists.
- Avoid introducing new global state patterns unless explicitly requested.

## Ant Design And CSS Rules

- Prefer Ant Design props, composition, and supported extension points before custom overrides.
- Prefer existing AntD usage patterns in nearby code.
- If custom overrides are still needed, include a brief justification of why library extension points were insufficient.
- Keep global CSS changes deliberate and scoped in `src/styles.css`.
- Avoid ad hoc styling patterns when a local established pattern already exists.

## Domain Storage API Separation

- `src/domain/*`: pure transforms and business rules.
- `src/storage/*`: persistence reads/writes and stored value normalization.
- `src/api/*`: fetch wrappers, request helpers, and client-side error handling.
- `api/*`: request validation, auth checks, external calls, and normalized JSON responses. Keep YouTube subroute behavior consolidated in `api/youtube.ts` to stay under Vercel Hobby function limits.

## Error Handling

- No silent failures for user-facing flows.
- Throw user-meaningful errors in client API wrappers.
- API handlers should return consistent failure payload shape: `{ error: string }`.
- Preserve existing status-code semantics when modifying handlers.

## Testing Conventions

- Pure logic: colocated `*.test.ts`.
- API wrapper behavior: `src/api/*.test.ts`.
- UI behavior and interaction: `*.test.tsx`.
- Critical UI flow/selector regressions: `tests/smoke.spec.ts`.

## Commands And Verification

Default order:

1. `npm run lint`
2. `npm run test:unit`

Additional checks:

1. Run `npm run test:smoke` when UI flows or selectors changed.
2. Run `npm run build` for build/config/runtime-impacting changes.
3. If a step is skipped, document why.

## Dependency Policy

- Use `npm ci` for clean install/CI flows.
- Use `npm install` only when dependency changes are intentional and explicitly requested.
- If dependencies change, ensure lockfile updates are intentional and reviewed.

## Documentation Maintenance Contract

- Update `PROJECT_ARCHITECTURE_SHORT.md` when architecture boundaries or key data flows change.
- Update this file when conventions or verification policy change.
- Keep `AGENTS.md` as the execution guardrail and these short docs as reference context.
