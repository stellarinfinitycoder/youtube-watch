import { useEffect, useState } from "react";
import {
  Alert,
  Button,
  Empty,
  Form,
  Input,
  List,
  Skeleton,
  Space,
  Spin,
  Typography
} from "antd";
import { ReloadOutlined } from "@ant-design/icons";
import type { FetchState } from "./types/youtube";
import {
  fetchViewCountsByVideoIds,
  getLatestVideosAndChannelByHandle
} from "./api/youtube";
import { normalizeHandle } from "./utils/handle";
import type { VideoItem } from "./types/youtube";

const { Title, Text } = Typography;
const DEFAULT_LIMIT = 15;
const COLUMN_COUNT = 3;
const HANDLE_STORAGE_KEY = "youtube-watch:handles:v1";
const COLUMNS_STORAGE_KEY = "youtube-watch:columns:v2";

type ColumnState = FetchState & {
  handleInput: string;
  channelThumbnailUrl: string;
};

type PersistedColumnState = {
  handleInput: string;
  currentHandle: string;
  channelThumbnailUrl: string;
  videos: VideoItem[];
};

function createColumnState(): ColumnState {
  return {
    handleInput: "",
    channelThumbnailUrl: "",
    loading: false,
    error: null,
    videos: [],
    currentHandle: ""
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
    handleInput?: unknown;
    currentHandle?: unknown;
    channelThumbnailUrl?: unknown;
    videos?: unknown;
  };

  if (
    typeof candidate.handleInput !== "string" ||
    typeof candidate.currentHandle !== "string" ||
    typeof candidate.channelThumbnailUrl !== "string" ||
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
    handleInput: candidate.handleInput,
    currentHandle: candidate.currentHandle,
    channelThumbnailUrl: candidate.channelThumbnailUrl,
    videos
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

function App() {
  const [columns, setColumns] = useState<ColumnState[]>(() => {
    const storedColumns = readStoredColumns();
    const storedHandles = readStoredHandles();
    return Array.from({ length: COLUMN_COUNT }, (_, index) => ({
      ...createColumnState(),
      handleInput: storedColumns[index]?.handleInput ?? storedHandles[index] ?? "",
      currentHandle: storedColumns[index]?.currentHandle ?? "",
      channelThumbnailUrl: storedColumns[index]?.channelThumbnailUrl ?? "",
      videos: storedColumns[index]?.videos ?? []
    }));
  });
  const [viewBackfillInFlight, setViewBackfillInFlight] = useState<number[]>([]);

  useEffect(() => {
    try {
      const storage = window.localStorage;
      if (!storage || typeof storage.setItem !== "function") {
        return;
      }

      const handles = columns.map((column) => column.handleInput);
      storage.setItem(HANDLE_STORAGE_KEY, JSON.stringify(handles));
      const persistedColumns: PersistedColumnState[] = columns.map((column) => ({
        handleInput: column.handleInput,
        currentHandle: column.currentHandle,
        channelThumbnailUrl: column.channelThumbnailUrl,
        videos: column.videos
      }));
      storage.setItem(COLUMNS_STORAGE_KEY, JSON.stringify(persistedColumns));
    } catch {
      // Ignore write failures (private mode / restricted environments).
    }
  }, [columns]);

  useEffect(() => {
    columns.forEach((column, index) => {
      const missingViewsIds = column.videos
        .filter((video) => video.viewCount === null)
        .map((video) => video.videoId);

      if (missingViewsIds.length === 0) {
        return;
      }

      if (viewBackfillInFlight.includes(index)) {
        return;
      }

      setViewBackfillInFlight((prev) => [...prev, index]);
      fetchViewCountsByVideoIds(missingViewsIds)
        .then((viewCounts) => {
          setColumn(index, (prev) => ({
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
          setViewBackfillInFlight((prev) => prev.filter((item) => item !== index));
        });
    });
  }, [columns, viewBackfillInFlight]);

  const setColumn = (index: number, updater: (state: ColumnState) => ColumnState) => {
    setColumns((previous) =>
      previous.map((column, columnIndex) =>
        columnIndex === index ? updater(column) : column
      )
    );
  };

  const runFetch = async (index: number, handle: string): Promise<void> => {
    setColumn(index, (prev) => ({ ...prev, loading: true, error: null }));

    try {
      const normalized = normalizeHandle(handle);
      const { videos, channelThumbnailUrl } =
        await getLatestVideosAndChannelByHandle(normalized, DEFAULT_LIMIT);
      setColumn(index, (prev) => ({
        ...prev,
        loading: false,
        error: null,
        videos,
        currentHandle: normalized,
        channelThumbnailUrl
      }));
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Failed to fetch videos.";
      setColumn(index, (prev) => ({ ...prev, loading: false, error: message }));
    }
  };

  return (
    <main className="app-shell">
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
            <article key={index} className="channel-column">
              <Form
                layout="vertical"
                onFinish={() => runFetch(index, column.handleInput)}
                className="full-width"
              >
                <div className="column-header">
                  {column.channelThumbnailUrl ? (
                    <img
                      src={column.channelThumbnailUrl}
                      alt={`Channel ${index + 1}`}
                      className="channel-avatar"
                      onError={() =>
                        setColumn(index, (prev) => ({
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
                      <span>+</span>
                    </div>
                  )}
                  <Input
                    placeholder="@channel"
                    value={column.handleInput}
                    className="channel-handle-input"
                    aria-label={`Channel ${index + 1} handle`}
                    onChange={(event) => {
                      const nextValue = event.target.value;
                      setColumn(index, (prev) => ({ ...prev, handleInput: nextValue }));
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

                <Space>
                  <Button
                    type="primary"
                    htmlType="submit"
                    disabled={!canSubmit}
                    loading={column.loading}
                    aria-label={`Fetch column ${index + 1}`}
                  >
                    Fetch
                  </Button>
                  <Button
                    icon={<ReloadOutlined />}
                    onClick={() => runFetch(index, column.currentHandle)}
                    disabled={!column.currentHandle || column.loading}
                    aria-label={`Refresh column ${index + 1}`}
                  >
                    Refresh
                  </Button>
                </Space>
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
    </main>
  );
}

export default App;
