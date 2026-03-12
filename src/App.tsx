import { useMemo, useState } from "react";
import {
  Alert,
  Button,
  Card,
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
import { getLatestVideosByHandle } from "./api/youtube";
import { normalizeHandle } from "./utils/handle";

const { Title, Text } = Typography;
const DEFAULT_LIMIT = 15;

function App() {
  const [handleInput, setHandleInput] = useState("");
  const [state, setState] = useState<FetchState>({
    loading: false,
    error: null,
    videos: [],
    currentHandle: ""
  });

  const canSubmit = useMemo(() => {
    try {
      normalizeHandle(handleInput);
      return true;
    } catch {
      return false;
    }
  }, [handleInput]);

  const runFetch = async (handle: string): Promise<void> => {
    setState((prev) => ({ ...prev, loading: true, error: null }));

    try {
      const normalized = normalizeHandle(handle);
      const videos = await getLatestVideosByHandle(normalized, DEFAULT_LIMIT);
      setState({
        loading: false,
        error: null,
        videos,
        currentHandle: normalized
      });
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Failed to fetch videos.";
      setState((prev) => ({ ...prev, loading: false, error: message }));
    }
  };

  return (
    <main className="app-shell">
      <Card className="app-card">
        <Space direction="vertical" size="large" className="full-width">
          <div>
            <Title level={2}>YouTube Watch</Title>
            <Text type="secondary">
              Enter a YouTube channel handle in @name format to load the latest
              15 uploads.
            </Text>
          </div>

          <Form
            layout="vertical"
            onFinish={() => runFetch(handleInput)}
            className="full-width"
          >
            <Form.Item
              label="Channel Handle"
              extra="Example: @GoogleDevelopers"
              validateStatus={handleInput.length > 0 && !canSubmit ? "error" : ""}
              help={
                handleInput.length > 0 && !canSubmit
                  ? "Handle must be @name and 3-30 valid characters."
                  : null
              }
            >
              <Input
                placeholder="@channel"
                value={handleInput}
                onChange={(event) => setHandleInput(event.target.value)}
                onPressEnter={(event) => {
                  if (!canSubmit || state.loading) {
                    event.preventDefault();
                  }
                }}
              />
            </Form.Item>

            <Space>
              <Button type="primary" htmlType="submit" disabled={!canSubmit} loading={state.loading}>
                Fetch Latest 15
              </Button>
              <Button
                icon={<ReloadOutlined />}
                onClick={() => runFetch(state.currentHandle)}
                disabled={!state.currentHandle || state.loading}
                aria-label="Refresh"
              >
                Refresh
              </Button>
            </Space>
          </Form>

          {state.loading && (
            <Space direction="vertical" className="full-width">
              <Text>Loading videos...</Text>
              <Spin />
              <Skeleton active paragraph={{ rows: 3 }} />
            </Space>
          )}

          {state.error && <Alert type="error" message={state.error} showIcon />}

          {!state.loading && !state.error && state.videos.length === 0 && (
            <Empty description="No videos loaded yet." />
          )}

          {!state.loading && state.videos.length > 0 && (
            <List
              itemLayout="vertical"
              dataSource={state.videos}
              renderItem={(video) => (
                <List.Item key={video.videoId}>
                  <Card hoverable>
                    <Space direction="vertical" size="small" className="full-width">
                      <a href={video.videoUrl} target="_blank" rel="noreferrer">
                        <Title level={4} className="video-title">
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
                      <Text>
                        Published:{" "}
                        {video.publishedAt
                          ? new Date(video.publishedAt).toLocaleString()
                          : "Unknown"}
                      </Text>
                    </Space>
                  </Card>
                </List.Item>
              )}
            />
          )}
        </Space>
      </Card>
    </main>
  );
}

export default App;
