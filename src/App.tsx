import { useEffect, useRef, useState } from "react";
import {
  Alert,
  Button,
  Empty,
  Form,
  Input,
  List,
  Modal,
  Skeleton,
  Space,
  Spin,
  Typography
} from "antd";
import type { FetchState } from "./types/youtube";
import {
  fetchViewCountsByVideoIds,
  getLatestVideosAndChannelByHandle
} from "./api/youtube";
import { normalizeHandle } from "./utils/handle";
import type { VideoItem } from "./types/youtube";

const { Title, Text } = Typography;
const DEFAULT_LIMIT = 15;
const DEFAULT_COLUMN_COUNT = 3;
const HANDLE_STORAGE_KEY = "youtube-watch:handles:v1";
const COLUMNS_STORAGE_KEY = "youtube-watch:columns:v2";

type ColumnState = FetchState & {
  id: string;
  handleInput: string;
  channelThumbnailUrl: string;
  lastFetchAt: string | null;
};

type PersistedColumnState = {
  id: string;
  handleInput: string;
  currentHandle: string;
  channelThumbnailUrl: string;
  videos: VideoItem[];
  lastFetchAt: string | null;
};

function createColumnId(): string {
  return `col-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function createColumnState(overrides?: Partial<ColumnState>): ColumnState {
  return {
    id: createColumnId(),
    handleInput: "",
    channelThumbnailUrl: "",
    lastFetchAt: null,
    loading: false,
    error: null,
    videos: [],
    currentHandle: "",
    ...overrides
  };
}

function readStoredHandles(): string[] {
  if (typeof window === "undefined") {
    return [];
  }

  try {
    const storage = window.localStorage;
    if (!storage || typeof storage.getItem !== "function") {
      return [];
    }

    const raw = storage.getItem(HANDLE_STORAGE_KEY);
    if (!raw) {
      return [];
    }

    const parsed = JSON.parse(raw) as unknown;
    return Array.isArray(parsed)
      ? parsed.filter((item): item is string => typeof item === "string")
      : [];
  } catch {
    return [];
  }
}

function sanitizePersistedColumn(raw: unknown): PersistedColumnState | null {
  if (!raw || typeof raw !== "object") {
    return null;
  }

  const candidate = raw as {
    id?: unknown;
    handleInput?: unknown;
    currentHandle?: unknown;
    channelThumbnailUrl?: unknown;
    videos?: unknown;
    lastFetchAt?: unknown;
  };

  if (
    !(typeof candidate.id === "string" || typeof candidate.id === "undefined") ||
    typeof candidate.handleInput !== "string" ||
    typeof candidate.currentHandle !== "string" ||
    typeof candidate.channelThumbnailUrl !== "string" ||
    !(typeof candidate.lastFetchAt === "string" || candidate.lastFetchAt === null) ||
    !Array.isArray(candidate.videos)
  ) {
    return null;
  }

  const videos: VideoItem[] = candidate.videos
    .map((video) => {
      if (!video || typeof video !== "object") {
        return null;
      }

      const item = video as Record<string, unknown>;
      if (
        typeof item.videoId !== "string" ||
        typeof item.title !== "string" ||
        typeof item.publishedAt !== "string" ||
        typeof item.thumbnailUrl !== "string" ||
        typeof item.channelTitle !== "string" ||
        typeof item.videoUrl !== "string" ||
        !(
          typeof item.viewCount === "number" ||
          item.viewCount === null ||
          typeof item.viewCount === "undefined"
        )
      ) {
        return null;
      }

      return {
        videoId: item.videoId,
        title: item.title,
        publishedAt: item.publishedAt,
        thumbnailUrl: item.thumbnailUrl,
        channelTitle: item.channelTitle,
        videoUrl: item.videoUrl,
        viewCount:
          typeof item.viewCount === "number" && Number.isFinite(item.viewCount)
            ? item.viewCount
            : null
      };
    })
    .filter((video): video is VideoItem => video !== null);

  return {
    id: candidate.id ?? createColumnId(),
    handleInput: candidate.handleInput,
    currentHandle: candidate.currentHandle,
    channelThumbnailUrl: candidate.channelThumbnailUrl,
    videos,
    lastFetchAt: candidate.lastFetchAt
  };
}

function readStoredColumns(): PersistedColumnState[] {
  if (typeof window === "undefined") {
    return [];
  }

  try {
    const storage = window.localStorage;
    if (!storage || typeof storage.getItem !== "function") {
      return [];
    }

    const raw = storage.getItem(COLUMNS_STORAGE_KEY);
    if (!raw) {
      return [];
    }

    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) {
      return [];
    }

    return parsed
      .map((item) => sanitizePersistedColumn(item))
      .filter((item): item is PersistedColumnState => item !== null);
  } catch {
    return [];
  }
}

function hasStoredColumnsState(): boolean {
  if (typeof window === "undefined") {
    return false;
  }

  try {
    const storage = window.localStorage;
    if (!storage || typeof storage.getItem !== "function") {
      return false;
    }
    return storage.getItem(COLUMNS_STORAGE_KEY) !== null;
  } catch {
    return false;
  }
}

function formatViewCount(viewCount: number | null): string {
  if (viewCount === null) {
    return "-";
  }
  const compact = new Intl.NumberFormat("en", {
    notation: "compact",
    maximumFractionDigits: 0
  }).format(viewCount);
  return compact.toLowerCase();
}

function formatVideoMeta(video: VideoItem): string {
  const dateLabel = video.publishedAt
    ? new Date(video.publishedAt).toLocaleString()
    : "Unknown date";
  return `${dateLabel}, ${formatViewCount(video.viewCount)}`;
}

function parseBulkHandles(raw: string): string[] {
  const tokens = raw
    .split(/[\s,]+/)
    .map((token) => token.trim())
    .filter(Boolean);

  const unique = new Set<string>();
  for (const token of tokens) {
    try {
      unique.add(normalizeHandle(token));
    } catch {
      // Ignore invalid handles in bulk mode.
    }
  }

  return [...unique];
}

function App() {
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const [isBulkModalOpen, setIsBulkModalOpen] = useState(false);
  const [bulkInput, setBulkInput] = useState("");
  const [pendingBulkFetch, setPendingBulkFetch] = useState<
    Array<{ id: string; handle: string }>
  >([]);
  const [columns, setColumns] = useState<ColumnState[]>(() => {
    const storedColumns = readStoredColumns();
    const storedColumnsExists = hasStoredColumnsState();
    const storedHandles = readStoredHandles();
    const resolvedCount = storedColumnsExists
      ? storedColumns.length
      : Math.max(DEFAULT_COLUMN_COUNT, storedHandles.length);
    return Array.from({ length: resolvedCount }, (_, index) =>
      createColumnState({
        id: storedColumns[index]?.id ?? createColumnId(),
        handleInput: storedColumns[index]?.handleInput ?? storedHandles[index] ?? "",
        currentHandle: storedColumns[index]?.currentHandle ?? "",
        channelThumbnailUrl: storedColumns[index]?.channelThumbnailUrl ?? "",
        videos: storedColumns[index]?.videos ?? [],
        lastFetchAt: storedColumns[index]?.lastFetchAt ?? null
      })
    );
  });
  const [viewBackfillInFlight, setViewBackfillInFlight] = useState<string[]>([]);

  useEffect(() => {
    try {
      const storage = window.localStorage;
      if (!storage || typeof storage.setItem !== "function") {
        return;
      }

      const handles = columns.map((column) => column.handleInput);
      storage.setItem(HANDLE_STORAGE_KEY, JSON.stringify(handles));
      const persistedColumns: PersistedColumnState[] = columns.map((column) => ({
        id: column.id,
        handleInput: column.handleInput,
        currentHandle: column.currentHandle,
        channelThumbnailUrl: column.channelThumbnailUrl,
        videos: column.videos,
        lastFetchAt: column.lastFetchAt
      }));
      storage.setItem(COLUMNS_STORAGE_KEY, JSON.stringify(persistedColumns));
    } catch {
      // Ignore write failures (private mode / restricted environments).
    }
  }, [columns]);

  useEffect(() => {
    columns.forEach((column) => {
      const missingViewsIds = column.videos
        .filter((video) => video.viewCount === null)
        .map((video) => video.videoId);

      if (missingViewsIds.length === 0) {
        return;
      }

      if (viewBackfillInFlight.includes(column.id)) {
        return;
      }

      setViewBackfillInFlight((prev) => [...prev, column.id]);
      fetchViewCountsByVideoIds(missingViewsIds)
        .then((viewCounts) => {
          setColumn(column.id, (prev) => ({
            ...prev,
            videos: prev.videos.map((video) => ({
              ...video,
              viewCount:
                video.viewCount ?? viewCounts[video.videoId] ?? video.viewCount
            }))
          }));
        })
        .catch(() => {
          // Ignore backfill errors; user can still refresh manually.
        })
        .finally(() => {
          setViewBackfillInFlight((prev) =>
            prev.filter((item) => item !== column.id)
          );
        });
    });
  }, [columns, viewBackfillInFlight]);

  useEffect(() => {
    if (pendingBulkFetch.length === 0) {
      return;
    }

    pendingBulkFetch.forEach((target) => {
      runFetch(target.id, target.handle);
    });
    setPendingBulkFetch([]);
  }, [pendingBulkFetch]);

  const setColumn = (
    columnId: string,
    updater: (state: ColumnState) => ColumnState
  ) => {
    setColumns((previous) =>
      previous.map((column) =>
        column.id === columnId ? updater(column) : column
      )
    );
  };

  const runFetch = async (columnId: string, handle: string): Promise<void> => {
    setColumn(columnId, (prev) => ({ ...prev, loading: true, error: null }));

    try {
      const normalized = normalizeHandle(handle);
      const { videos, channelThumbnailUrl } =
        await getLatestVideosAndChannelByHandle(normalized, DEFAULT_LIMIT);
      setColumn(columnId, (prev) => ({
        ...prev,
        loading: false,
        error: null,
        videos,
        currentHandle: normalized,
        channelThumbnailUrl,
        lastFetchAt: new Date().toLocaleString()
      }));
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Failed to fetch videos.";
      setColumn(columnId, (prev) => ({ ...prev, loading: false, error: message }));
    }
  };

  const addColumn = (): void => {
    setColumns((previous) => [...previous, createColumnState()]);
  };

  const removeColumnAt = (indexToRemove: number): void => {
    setColumns((previous) =>
      previous.filter((_, index) => index !== indexToRemove)
    );
  };

  const handleBulkAddConfirm = (): void => {
    const handles = parseBulkHandles(bulkInput);
    if (handles.length === 0) {
      setIsBulkModalOpen(false);
      setBulkInput("");
      return;
    }

    const created = handles.map((handle) =>
      createColumnState({ handleInput: handle })
    );
    setColumns((previous) => [
      ...previous,
      ...created
    ]);
    setPendingBulkFetch(created.map((column) => ({ id: column.id, handle: column.handleInput })));
    setIsBulkModalOpen(false);
    setBulkInput("");
  };

  const fetchAllColumns = (): void => {
    columns.forEach((column) => {
      try {
        normalizeHandle(column.handleInput);
        runFetch(column.id, column.handleInput);
      } catch {
        // Skip invalid or empty handles.
      }
    });
  };

  const scrollColumns = (direction: "left" | "right"): void => {
    const node = scrollRef.current;
    if (!node) {
      return;
    }

    const delta = direction === "left" ? -360 : 360;
    node.scrollBy({ left: delta, behavior: "smooth" });
  };

  const scrollToEdge = (edge: "start" | "end"): void => {
    const node = scrollRef.current;
    if (!node) {
      return;
    }

    if (edge === "start") {
      node.scrollTo({ left: 0, behavior: "smooth" });
      return;
    }

    const maxLeft = Math.max(0, node.scrollWidth - node.clientWidth);
    node.scrollTo({ left: maxLeft, behavior: "smooth" });
  };

  return (
    <main className="app-shell">
      <div className="columns-nav">
        <Button
          htmlType="button"
          onClick={() => scrollToEdge("start")}
          aria-label="Scroll columns to first"
          className="nav-btn scroll-btn"
        >
          {"<<"}
        </Button>
        <Button
          htmlType="button"
          onClick={() => scrollColumns("left")}
          aria-label="Scroll columns left"
          className="nav-btn scroll-btn"
        >
          {"<"}
        </Button>
        <Button
          htmlType="button"
          onClick={() => scrollColumns("right")}
          aria-label="Scroll columns right"
          className="nav-btn scroll-btn"
        >
          {">"}
        </Button>
        <Button
          htmlType="button"
          onClick={() => scrollToEdge("end")}
          aria-label="Scroll columns to last"
          className="nav-btn scroll-btn"
        >
          {">>"}
        </Button>
        <Button
          htmlType="button"
          onClick={() => setIsBulkModalOpen(true)}
          aria-label="Bulk add channels"
          className="nav-btn add-channels-btn"
        >
          Add Channels
        </Button>
        <Button
          htmlType="button"
          onClick={fetchAllColumns}
          aria-label="Fetch all channels"
          className="nav-btn"
        >
          Fetch All
        </Button>
      </div>

      <Modal
        title="Add Channels"
        open={isBulkModalOpen}
        onCancel={() => setIsBulkModalOpen(false)}
        onOk={handleBulkAddConfirm}
        okText="Add"
      >
        <Input.TextArea
          value={bulkInput}
          onChange={(event) => setBulkInput(event.target.value)}
          autoSize={{ minRows: 6, maxRows: 12 }}
          placeholder={"@channelOne\n@channelTwo\n@channelThree"}
        />
      </Modal>

      <div
        ref={scrollRef}
        className="columns-scroll"
      >
        <div className="columns-layout">
          <section className="columns-grid">
            {columns.map((column, index) => {
          const canSubmit = (() => {
            try {
              normalizeHandle(column.handleInput);
              return true;
            } catch {
              return false;
            }
          })();

          return (
            <article key={column.id} className="channel-column">
              <div className="column-actions">
                <div className="column-actions-left">
                  <Button
                    type="primary"
                    htmlType="button"
                    onClick={() => runFetch(column.id, column.handleInput)}
                    disabled={!canSubmit || column.loading}
                    loading={column.loading}
                    aria-label={`Fetch column ${index + 1}`}
                  >
                    Fetch
                  </Button>
                  <Text className="last-fetch-text">
                    {column.lastFetchAt ?? "-"}
                  </Text>
                </div>
                <Button
                  htmlType="button"
                  onClick={() => removeColumnAt(index)}
                  disabled={column.loading}
                  aria-label={`Remove column ${index + 1}`}
                  className="remove-column-btn"
                >
                  x
                </Button>
              </div>

              <Form
                layout="vertical"
                className="full-width"
              >
                <div className="column-header">
                  {column.channelThumbnailUrl ? (
                    <img
                      src={column.channelThumbnailUrl}
                      alt={`Channel ${index + 1}`}
                      className="channel-avatar"
                      onError={() =>
                        setColumn(column.id, (prev) => ({
                          ...prev,
                          channelThumbnailUrl: ""
                        }))
                      }
                    />
                  ) : (
                    <div
                      className="channel-avatar channel-avatar-placeholder"
                      aria-label={`Channel ${index + 1} placeholder`}
                    >
                      <span />
                    </div>
                  )}
                  <Input
                    placeholder="@channel"
                    value={column.handleInput}
                    className="channel-handle-input"
                    aria-label={`Channel ${index + 1} handle`}
                    onChange={(event) => {
                      const nextValue = event.target.value;
                      setColumn(column.id, (prev) => ({
                        ...prev,
                        handleInput: nextValue
                      }));
                    }}
                    onPressEnter={(event) => {
                      if (!canSubmit || column.loading) {
                        event.preventDefault();
                      }
                    }}
                  />
                </div>

                {column.handleInput.length > 0 && !canSubmit ? (
                  <Text type="danger" className="input-hint">
                    Use @name
                  </Text>
                ) : null}
              </Form>

              {column.loading && (
                <Space direction="vertical" className="full-width">
                  <Text>Loading...</Text>
                  <Spin />
                  <Skeleton active paragraph={{ rows: 2 }} />
                </Space>
              )}

              {column.error && <Alert type="error" message={column.error} showIcon />}

              {!column.loading && !column.error && column.videos.length === 0 && (
                <Empty description="No data" image={Empty.PRESENTED_IMAGE_SIMPLE} />
              )}

              {!column.loading && column.videos.length > 0 && (
                <List
                  itemLayout="vertical"
                  dataSource={column.videos}
                  renderItem={(video) => (
                    <List.Item key={video.videoId}>
                      <Space direction="vertical" size="small" className="full-width">
                        <a href={video.videoUrl} target="_blank" rel="noreferrer">
                          <Title level={5} className="video-title">
                            {video.title}
                          </Title>
                        </a>
                        {video.thumbnailUrl ? (
                          <a href={video.videoUrl} target="_blank" rel="noreferrer">
                            <img
                              src={video.thumbnailUrl}
                              alt={video.title}
                              className="video-thumb"
                            />
                          </a>
                        ) : null}
                        <Text type="secondary">{video.channelTitle}</Text>
                        <Text className="video-meta">{formatVideoMeta(video)}</Text>
                      </Space>
                    </List.Item>
                  )}
                />
              )}
            </article>
          );
            })}
          </section>
          <aside className="add-column-rail">
            <Button
              htmlType="button"
              onClick={addColumn}
              aria-label="Add column"
              className="add-column-btn"
            >
              +
            </Button>
          </aside>
        </div>
      </div>
    </main>
  );
}

export default App;
