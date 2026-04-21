# Memory

- In the settings dropdown, `Open Info` should appear immediately before `Open Logs`.
- The user-facing label is `Open Info`, not `Open Stats`.
- For topbar or settings dropdown UI changes, validate with a targeted component test such as `npx vitest run src/components/AppTopbar.test.tsx`.
- The repo's `npm run test:unit` script does not cover `AppTopbar` UI behavior, so it is not sufficient validation for these changes.
- Be careful when committing `src/components/AppTopbar.tsx` changes: the file may contain broader unrelated local edits, which can easily produce mixed-scope commits.
