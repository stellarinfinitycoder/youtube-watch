# Memory

- In the settings dropdown, `Open Info` should appear immediately before `Open Logs`.
- The user-facing label is `Open Info`, not `Open Stats`.
- For topbar or settings dropdown UI changes, validate with a targeted component test such as `npx vitest run src/components/AppTopbar.test.tsx`.
- The repo's `npm run test:unit` script does not cover `AppTopbar` UI behavior, so it is not sufficient validation for these changes.
- Be careful when committing `src/components/AppTopbar.tsx` changes: the file may contain broader unrelated local edits, which can easily produce mixed-scope commits.
- `Delete Summaries` clears summary cache from IndexedDB only; legacy summary `localStorage` cleanup is out of scope.
- `Delete Summaries` should only delete cached summaries; it should not reset saved summary-format model settings.
- IndexedDB currently stores `transcripts`, `summaries`, and board state.
- Boards are persisted in IndexedDB first, with legacy `localStorage` board keys kept readable for migration/fallback.
- For `Delete Summaries` regression coverage, prefer a dedicated focused test such as `src/App.deleteSummaries.test.tsx` over the broader `src/App.test.tsx`, which has unrelated instability.
