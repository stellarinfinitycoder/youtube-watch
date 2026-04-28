## Vite Warning Execution Plan

### Goal
Reduce the main entry bundle and make the Vite large-chunk warning less severe without changing app behavior.

### Phase 1: Split rarely used UI flows
1. Lazy-load heavy maintenance/admin modals
- Candidates in [`/Users/vitaly/Desktop/Vibecoding/Youtube Watch/src/App.tsx`](/Users/vitaly/Desktop/Vibecoding/Youtube%20Watch/src/App.tsx):
  - logs modal
  - backfill modal
  - delete summaries modal
  - other maintenance-only dialogs if they are componentized
- Reason: low-frequency interactions

2. Move more modal bodies into dedicated components
- Goal: make them eligible for independent chunking
- Reason: `App.tsx` still keeps too much render code inline

### Phase 2: Manual chunking
3. Add `manualChunks` in [`/Users/vitaly/Desktop/Vibecoding/Youtube Watch/vite.config.ts`](/Users/vitaly/Desktop/Vibecoding/Youtube%20Watch/vite.config.ts)
- Proposed buckets:
  - `antd-vendor`: `antd`
  - `markdown-vendor`: `react-markdown`, `remark-gfm`
- Goal: reduce the size of the main entry chunk

4. Verify chunk output after manual chunking
- Run build and compare:
  - main `index-*.js`
  - transcript summary chunk
  - vendor chunks

Status: completed
- Added manual chunking for `antd` and markdown dependencies in `vite.config.ts`.
- Build verification now emits separate `antd-vendor` and `markdown-vendor` chunks.

### Phase 3: App shell trimming
5. Continue shrinking [`/Users/vitaly/Desktop/Vibecoding/Youtube Watch/src/App.tsx`](/Users/vitaly/Desktop/Vibecoding/Youtube%20Watch/src/App.tsx)
- Extract rarely used flows into page/component modules
- Keep only board shell and hot-path logic in main entry

### Success criteria
- Main `index-*.js` drops materially
- Vite warning may still exist, but the entry chunk should be meaningfully smaller

### Recommended execution order
1. Phase 1
2. Phase 2
3. Phase 3

### Best first implementation slice
1. Add `manualChunks` in `vite.config.ts`
2. Extract rarely used flows into lazy component modules

That is the cleanest first pass.
