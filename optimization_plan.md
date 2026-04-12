# Optimization Plan

## Phase 1
Goal: faster UI without changing behavior.

Status: partially completed.

Completed:
1. Extracted top bar from [src/App.tsx](/Users/vitaly/Desktop/Vibecoding/Youtube%20Watch/src/App.tsx) into [src/components/AppTopbar.tsx](/Users/vitaly/Desktop/Vibecoding/Youtube%20Watch/src/components/AppTopbar.tsx).
2. Extracted board/column rendering into [src/components/BoardColumns.tsx](/Users/vitaly/Desktop/Vibecoding/Youtube%20Watch/src/components/BoardColumns.tsx).
3. Extracted video playback modal into [src/components/VideoPlayerModal.tsx](/Users/vitaly/Desktop/Vibecoding/Youtube%20Watch/src/components/VideoPlayerModal.tsx).
4. Added [src/components/LazyRender.tsx](/Users/vitaly/Desktop/Vibecoding/Youtube%20Watch/src/components/LazyRender.tsx) to keep heavy board views lighter.
5. Added transcript/summary modal shell in [src/components/TranscriptSummaryModal.tsx](/Users/vitaly/Desktop/Vibecoding/Youtube%20Watch/src/components/TranscriptSummaryModal.tsx).
6. Rewired [src/App.tsx](/Users/vitaly/Desktop/Vibecoding/Youtube%20Watch/src/App.tsx) to use the extracted top bar, board columns, and video modal components.
7. Fixed the post-extraction horizontal scroll regression by moving `scrollRef` ownership to the real scroll container inside [src/components/BoardColumns.tsx](/Users/vitaly/Desktop/Vibecoding/Youtube%20Watch/src/components/BoardColumns.tsx).

Remaining:
1. Finish extracting the transcript/summary modal logic out of [src/App.tsx](/Users/vitaly/Desktop/Vibecoding/Youtube%20Watch/src/App.tsx) so the shell component owns the full flow.
2. Add targeted memo boundaries only where rerender profiling still shows payoff.
3. Revisit prop stability and inline callback churn after the modal extraction is complete.

## Phase 2
Goal: reduce localStorage overhead and state churn.

Status: completed.

Completed:
1. Split persistence into slices:
   - [src/storage/boardsStorage.ts](/Users/vitaly/Desktop/Vibecoding/Youtube%20Watch/src/storage/boardsStorage.ts)
   - [src/storage/progressStorage.ts](/Users/vitaly/Desktop/Vibecoding/Youtube%20Watch/src/storage/progressStorage.ts)
   - [src/storage/summariesStorage.ts](/Users/vitaly/Desktop/Vibecoding/Youtube%20Watch/src/storage/summariesStorage.ts)
   - [src/storage/transcriptsStorage.ts](/Users/vitaly/Desktop/Vibecoding/Youtube%20Watch/src/storage/transcriptsStorage.ts)
2. Debounced board writes in [src/App.tsx](/Users/vitaly/Desktop/Vibecoding/Youtube%20Watch/src/App.tsx) to 400ms.
3. Moved transcript and summary caches outside the board payload path and into dedicated storage helpers.
4. Moved quota estimate, error logs, and video progress persistence behind dedicated storage helpers.
5. Moved per-board view refresh runtime data out of the board snapshot into separate progress storage.
6. Shrunk the serialized board payload by omitting non-essential runtime cache data and only writing non-default optional fields where possible.

## Phase 3
Goal: simplify logic.

Status: completed.

Completed:
1. Extracted filter/domain logic into:
   - [src/domain/filters.ts](/Users/vitaly/Desktop/Vibecoding/Youtube%20Watch/src/domain/filters.ts)
   - [src/domain/watched.ts](/Users/vitaly/Desktop/Vibecoding/Youtube%20Watch/src/domain/watched.ts)
   - [src/domain/boards.ts](/Users/vitaly/Desktop/Vibecoding/Youtube%20Watch/src/domain/boards.ts)
   - [src/domain/savedLists.ts](/Users/vitaly/Desktop/Vibecoding/Youtube%20Watch/src/domain/savedLists.ts)
2. Extracted transcript/summary state and actions into:
   - [src/hooks/useTranscriptSummary.ts](/Users/vitaly/Desktop/Vibecoding/Youtube%20Watch/src/hooks/useTranscriptSummary.ts)
3. Extracted active-board selector logic into:
   - [src/hooks/useBoardFilters.ts](/Users/vitaly/Desktop/Vibecoding/Youtube%20Watch/src/hooks/useBoardFilters.ts)
4. Rewired [src/App.tsx](/Users/vitaly/Desktop/Vibecoding/Youtube%20Watch/src/App.tsx) to use the shared domain/helpers instead of duplicating:
   - video window filtering
   - duration filtering
   - watched-state checks and mutations
   - transcript/summary modal orchestration
   - active-board visible/hidden/shown-video selectors
5. Reused the same board selector logic for agent-mode state reads, removing the parallel filtering implementation.
6. Extracted saved-list ordering and mutations into shared saved-list helpers:
   - list-name generation
   - saved-order normalization
   - saved sort projection
   - add/remove/clear/move video mutations
   - manual reordering helper
7. Extracted basic board/column mutation helpers:
   - update board by id
   - update column by id
   - append columns
   - remove column
   - move column left/right

Notes:
1. `usePersistedState` was intentionally skipped. It does not currently remove enough real complexity to justify another abstraction.
2. Publisher/admin logic remains isolated in [src/pages/PublisherAdminPage.tsx](/Users/vitaly/Desktop/Vibecoding/Youtube%20Watch/src/pages/PublisherAdminPage.tsx), which is sufficient for this phase.

## Phase 4
Goal: optimize heavy board views.

1. Virtualize video tiles inside columns
   Only if needed after phases 1–3.
   Likely:
   - [src/components/VirtualVideoList.tsx](/Users/vitaly/Desktop/Vibecoding/Youtube%20Watch/src/components/VirtualVideoList.tsx)

2. Lazy render offscreen columns
   - full content only when near viewport
   - hidden columns remain thumbnail-only

3. Cache derived filtered results per board/filter signature
   - especially for `LAST 90D` and large boards

## Phase 5
Goal: structural cleanup.

1. Normalize data model
   Longer-term:
   - `boardsById`
   - `columnsById`
   - `videosById`
   - ordered ids arrays
   This makes updates smaller and safer.

2. Consider IndexedDB
   Only if localStorage pressure continues.

## Recommended execution order
1. Extract and memoize components
2. Split/debounce persistence
3. Extract filter/playback/transcript hooks
4. Measure again on `LAST 90D`
5. Add virtualization only if still needed

## Best immediate implementation scope
If we do one focused refactor next, choose:

1. `Topbar`
2. `ChannelColumn`
3. `SavedListColumn`
4. `VideoTile`
5. debounced sliced persistence

That should give the biggest speed improvement with manageable risk.
