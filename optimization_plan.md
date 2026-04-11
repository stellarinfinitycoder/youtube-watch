# Optimization Plan

## Phase 1
Goal: faster UI without changing behavior.

1. Extract UI from [src/App.tsx](/Users/vitaly/Desktop/Vibecoding/Youtube%20Watch/src/App.tsx)
   Create:
   - [src/components/Topbar.tsx](/Users/vitaly/Desktop/Vibecoding/Youtube%20Watch/src/components/Topbar.tsx)
   - [src/components/BoardColumns.tsx](/Users/vitaly/Desktop/Vibecoding/Youtube%20Watch/src/components/BoardColumns.tsx)
   - [src/components/ChannelColumn.tsx](/Users/vitaly/Desktop/Vibecoding/Youtube%20Watch/src/components/ChannelColumn.tsx)
   - [src/components/SavedListColumn.tsx](/Users/vitaly/Desktop/Vibecoding/Youtube%20Watch/src/components/SavedListColumn.tsx)
   - [src/components/VideoTile.tsx](/Users/vitaly/Desktop/Vibecoding/Youtube%20Watch/src/components/VideoTile.tsx)

2. Memoize rendering boundaries
   - `React.memo` on column and tile components
   - pass only minimal props
   - replace inline lambdas where they cause unnecessary rerenders

3. Extract modals from board rendering path
   Create:
   - [src/components/VideoPlayerModal.tsx](/Users/vitaly/Desktop/Vibecoding/Youtube%20Watch/src/components/VideoPlayerModal.tsx)
   - [src/components/TranscriptSummaryModal.tsx](/Users/vitaly/Desktop/Vibecoding/Youtube%20Watch/src/components/TranscriptSummaryModal.tsx)
   - [src/components/modals/](/Users/vitaly/Desktop/Vibecoding/Youtube%20Watch/src/components/modals/)
   This isolates expensive modal state from the main board tree.

## Phase 2
Goal: reduce localStorage overhead and state churn.

1. Split persistence into slices
   Create:
   - [src/storage/boardsStorage.ts](/Users/vitaly/Desktop/Vibecoding/Youtube%20Watch/src/storage/boardsStorage.ts)
   - [src/storage/progressStorage.ts](/Users/vitaly/Desktop/Vibecoding/Youtube%20Watch/src/storage/progressStorage.ts)
   - [src/storage/summariesStorage.ts](/Users/vitaly/Desktop/Vibecoding/Youtube%20Watch/src/storage/summariesStorage.ts)
   - [src/storage/transcriptsStorage.ts](/Users/vitaly/Desktop/Vibecoding/Youtube%20Watch/src/storage/transcriptsStorage.ts)

2. Debounce writes
   - boards: 300–500ms
   - summaries/transcripts: write-through ok
   - UI-only state: never persist unless needed

3. Remove non-essential data from board payload
   Keep board payload focused on:
   - board structure
   - channel/list membership
   - watched state
   - filters
   Move caches elsewhere.

## Phase 3
Goal: simplify logic.

1. Extract domain helpers
   Create:
   - [src/domain/boards.ts](/Users/vitaly/Desktop/Vibecoding/Youtube%20Watch/src/domain/boards.ts)
   - [src/domain/videos.ts](/Users/vitaly/Desktop/Vibecoding/Youtube%20Watch/src/domain/videos.ts)
   - [src/domain/filters.ts](/Users/vitaly/Desktop/Vibecoding/Youtube%20Watch/src/domain/filters.ts)
   - [src/domain/watched.ts](/Users/vitaly/Desktop/Vibecoding/Youtube%20Watch/src/domain/watched.ts)
   - [src/domain/savedLists.ts](/Users/vitaly/Desktop/Vibecoding/Youtube%20Watch/src/domain/savedLists.ts)

2. Extract hooks
   Create:
   - [src/hooks/useBoardFilters.ts](/Users/vitaly/Desktop/Vibecoding/Youtube%20Watch/src/hooks/useBoardFilters.ts)
   - [src/hooks/usePlaybackController.ts](/Users/vitaly/Desktop/Vibecoding/Youtube%20Watch/src/hooks/usePlaybackController.ts)
   - [src/hooks/useTranscriptSummary.ts](/Users/vitaly/Desktop/Vibecoding/Youtube%20Watch/src/hooks/useTranscriptSummary.ts)
   - [src/hooks/usePersistedState.ts](/Users/vitaly/Desktop/Vibecoding/Youtube%20Watch/src/hooks/usePersistedState.ts)

3. Move published/admin logic out of app shell
   - keep [src/pages/PublisherAdminPage.tsx](/Users/vitaly/Desktop/Vibecoding/Youtube%20Watch/src/pages/PublisherAdminPage.tsx) isolated
   - remove any publisher-specific state from board runtime where possible

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
