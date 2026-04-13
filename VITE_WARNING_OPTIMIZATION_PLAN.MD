## Vite Warning Execution Plan

### Goal
Reduce the main entry bundle and make the Vite large-chunk warning less severe without changing app behavior.

### Phase 1: Split non-core pages
1. Lazy-load publisher admin page
- Target: [`/Users/vitaly/Desktop/Vibecoding/Youtube Watch/src/pages/PublisherAdminPage.tsx`](/Users/vitaly/Desktop/Vibecoding/Youtube%20Watch/src/pages/PublisherAdminPage.tsx)
- Reason: not part of main board usage

2. Lazy-load public news page
- Target: [`/Users/vitaly/Desktop/Vibecoding/Youtube Watch/src/pages/PublicNewsPage.tsx`](/Users/vitaly/Desktop/Vibecoding/Youtube%20Watch/src/pages/PublicNewsPage.tsx)
- Reason: public feed route should not inflate the board app bundle

3. Lazy-load single news item page if separate
- Target: any public post/item page component if it exists
- Reason: same as above

Status: completed
- `PublisherAdminPage` now loads through `React.lazy`.
- `PublicNewsPage` now loads through `React.lazy`.
- There is no separate single news item page component today; detail routing is handled inside `PublicNewsPage`.

### Phase 2: Split rarely used UI flows
4. Lazy-load heavy maintenance/admin modals
- Candidates in [`/Users/vitaly/Desktop/Vibecoding/Youtube Watch/src/App.tsx`](/Users/vitaly/Desktop/Vibecoding/Youtube%20Watch/src/App.tsx):
  - logs modal
  - backfill modal
  - delete summaries modal
  - other maintenance-only dialogs if they are componentized
- Reason: low-frequency interactions

5. Move more modal bodies into dedicated components
- Goal: make them eligible for independent chunking
- Reason: `App.tsx` still keeps too much render code inline

### Phase 3: Manual chunking
6. Add `manualChunks` in [`/Users/vitaly/Desktop/Vibecoding/Youtube Watch/vite.config.ts`](/Users/vitaly/Desktop/Vibecoding/Youtube%20Watch/vite.config.ts)
- Proposed buckets:
  - `antd-vendor`: `antd`
  - `markdown-vendor`: `react-markdown`, `remark-gfm`
  - `publisher`: publisher/news page code
- Goal: reduce the size of the main entry chunk

7. Verify chunk output after manual chunking
- Run build and compare:
  - main `index-*.js`
  - transcript summary chunk
  - publisher chunk
  - vendor chunks

Status: completed
- Added manual chunking for `antd`, markdown dependencies, and publisher/news code in `vite.config.ts`.
- Build verification now emits separate `antd-vendor`, `markdown-vendor`, and `publisher` chunks.

### Phase 4: App shell trimming
8. Continue shrinking [`/Users/vitaly/Desktop/Vibecoding/Youtube Watch/src/App.tsx`](/Users/vitaly/Desktop/Vibecoding/Youtube%20Watch/src/App.tsx)
- Extract rarely used flows into page/component modules
- Keep only board shell and hot-path logic in main entry

### Success criteria
- Main `index-*.js` drops materially
- Publisher/news code no longer sits in main chunk
- Vite warning may still exist, but the entry chunk should be meaningfully smaller

### Recommended execution order
1. Phase 1
2. Phase 3
3. Phase 2
4. Phase 4

### Best first implementation slice
1. Lazy-load `PublisherAdminPage`
2. Lazy-load `PublicNewsPage`
3. Add `manualChunks` in `vite.config.ts`

That is the cleanest first pass.
