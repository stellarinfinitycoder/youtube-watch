# Agent API

This app exposes a runtime API on `window.appAgent` for automation agents.

## Enable

- Optional mode flag: `?agent=1`
- Optional permission flag: `?agentPerm=read-only|safe-write|full`
- If omitted, permission defaults to `full`.

## Permissions

- `read-only`: only read APIs and `ping()`.
- `safe-write`: allows navigation/fetch/play/open/copy/filter actions, blocks persistent state mutations.
- `full`: allows all exposed actions.

Blocked in `safe-write`:

- `markBoardShownVideosWatched`
- `markBoardShownVideosNew`
- `markChannelShownVideosWatched`
- `markChannelShownVideosNew`
- `markVideoWatched`
- `markVideoNew`
- `saveVideo`

## Surface

```ts
window.appAgent = {
  version: "1.0.0",
  mode: "enabled" | "disabled",
  permission: "read-only" | "safe-write" | "full",
  capabilities: { canRead, canWrite, canDelete },
  readState: () => AgentState,
  actions: {
    ping(),
    selectBoard(boardId),
    setFilters(patch),
    fetchAllShownBoardChannels(),
    fetchChannel(columnId),
    playBoardShownVideos(),
    playChannelShownVideos(columnId),
    markBoardShownVideosWatched(),
    markBoardShownVideosNew(),
    markChannelShownVideosWatched(columnId),
    markChannelShownVideosNew(columnId),
    markVideoWatched(videoId),
    markVideoNew(videoId),
    saveVideo(videoId, listId),
    copyVideoLink(videoId),
    openVideo(videoId)
  }
}
```

## Action Result Shape

All actions resolve to:

```ts
{
  ok: boolean,
  action: string,
  scope: "board" | "channel" | "video",
  changed?: { videoIds?: string[]; columnIds?: string[] },
  error?: { code: string; message: string }
}
```

## Events

The app dispatches `CustomEvent`s on `window`:

- `app:action-start`
- `app:action-end`
- `app:state-changed`
- `app:error`

Payloads include a timestamp (`ts`) and action metadata when applicable.

`app:action-end` includes counters:

```ts
{
  counters: {
    before: {
      shownVideosTotal: number;
      visibleColumnCount: number;
      hiddenColumnCount: number;
    },
    after: {
      shownVideosTotal: number;
      visibleColumnCount: number;
      hiddenColumnCount: number;
    }
  }
}
```

## DOM Contract (Fallback Automation)

Video items:

- `data-video-id`
- `data-url`
- `data-board-id`
- `data-column-id`
- `data-handle`
- `data-state` (`new` or `watched`)

Column containers:

- `data-board-id`
- `data-column-id`
- `data-handle`
- `data-hidden`

Stable controls also expose `data-testid` on key topbar/column/video actions.
