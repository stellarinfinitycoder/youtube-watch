## Transcript/Summary Optimization Plan

### 1. Lazy-load transcript/summary modal stack
- Load [`/Users/vitaly/Desktop/Vibecoding/Youtube Watch/src/components/TranscriptSummaryModal.tsx`](/Users/vitaly/Desktop/Vibecoding/Youtube%20Watch/src/components/TranscriptSummaryModal.tsx) with `React.lazy`.
- Keep transcript/summary/publisher-related UI out of the main bundle until opened.
- Goal: reduce initial load and main bundle weight.

Status: completed
- Transcript/summary modal stack now loads through `React.lazy`.
- Transcript/summary UI moved out of the main app render path into its own chunk.

### 2. Keep transcript/summary tree mounted only while open
- Ensure modal subtree is created only when active.
- Avoid hidden mounted content doing work in the background.
- Goal: reduce idle UI cost.

Status: completed
- Transcript/summary modal subtree now mounts only when an active transcript video exists.
- Hidden transcript/summary UI no longer stays mounted in the main tree.

### 3. Simplify summary rendering path
- Use plain text rendering by default.
- Use markdown rendering only when content actually looks like markdown.
- Keep all-formats mode efficient and avoid unnecessary markdown parsing.
- Goal: reduce render cost for long summaries.

### 4. Strengthen cache-first flow
- Read transcript cache before any fetch.
- Read per-format summary cache before any generation.
- Only regenerate on explicit user action or format change.
- Goal: eliminate unnecessary network/model work.

Status: completed
- Transcript cache is read first on open.
- Cached default-format summary is hydrated immediately when available.
- Regeneration still happens only on explicit regenerate or format change.

### 6. Defer publisher actions
- Only enable/load publisher-specific actions once a summary exists.
- Keep publish-related state/actions out of the hot open path as much as possible.
- Goal: reduce summary modal overhead.

Status: completed
- `publishVideoSummary` now loads via dynamic import from `useTranscriptSummary` through a dedicated publish-only API module.
- Publish button in the transcript/summary modal now renders only when a summary is actually publishable or publish feedback is active.

### Recommended execution order
1. Step 1
2. Step 2
3. Step 4
4. Step 3
5. Step 6

### Best first implementation slice
- Step 1 + Step 2 + Step 4

Reason:
- biggest payoff
- lowest risk
- improves both startup cost and modal responsiveness
