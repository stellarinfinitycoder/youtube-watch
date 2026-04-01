import { useEffect, useMemo, useState } from "react";
import { Button, Space, Typography } from "antd";
import {
  fetchPublicPublishedItem,
  fetchPublicPublishedItems
} from "../api/publisher";
import type { PublishedItem } from "../types/publisher";

const { Title, Text, Link } = Typography;

function formatDateTime(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "--.-- --:--";
  }
  const dd = String(date.getDate()).padStart(2, "0");
  const mm = String(date.getMonth() + 1).padStart(2, "0");
  const hh = String(date.getHours()).padStart(2, "0");
  const min = String(date.getMinutes()).padStart(2, "0");
  return `${dd}.${mm} ${hh}:${min}`;
}

function formatSummaryForDisplay(summary: string): string {
  const normalized = summary.replace(/\r\n/g, "\n").trim();
  if (!normalized) {
    return "";
  }
  if (normalized.includes("\n")) {
    return normalized;
  }
  return normalized.replace(/\s[–-]\s/g, "\n• ");
}

export default function PublicNewsPage() {
  const pathname = window.location.pathname;
  const detailId = useMemo(() => {
    const match = pathname.match(/^\/news\/(.+)$/);
    return match ? decodeURIComponent(match[1]) : "";
  }, [pathname]);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [items, setItems] = useState<PublishedItem[]>([]);
  const [detail, setDetail] = useState<PublishedItem | null>(null);

  useEffect(() => {
    const load = async (): Promise<void> => {
      setLoading(true);
      setError(null);
      try {
        if (detailId) {
          const item = await fetchPublicPublishedItem(detailId);
          setDetail(item);
          setItems([]);
        } else {
          const list = await fetchPublicPublishedItems(100);
          setItems(list);
          setDetail(null);
        }
      } catch (loadError) {
        const message = loadError instanceof Error ? loadError.message : "Failed to load news.";
        setError(message);
      } finally {
        setLoading(false);
      }
    };
    void load();
  }, [detailId]);

  return (
    <main className="app-shell">
      <div className="columns-nav" style={{ marginBottom: 10 }}>
        <Title level={4} style={{ margin: 0 }}>
          News Feed
        </Title>
        <Button className="nav-btn" onClick={() => window.location.assign("/news")}>
          All News
        </Button>
        <Button className="nav-btn" onClick={() => window.location.assign("/rss.xml")}>
          RSS
        </Button>
      </div>

      {loading ? <Text>Loading...</Text> : null}
      {error ? <Text type="danger">{error}</Text> : null}

      {!loading && !error && detail ? (
        <Space direction="vertical" className="full-width" size={10}>
          <Title level={4} style={{ margin: 0, color: "var(--text-strong)", textTransform: "none" }}>
            {detail.title}
          </Title>
          <Text style={{ color: "var(--muted)" }}>
            {detail.channelTitle || "-"} | {formatDateTime(detail.updatedAt)}
          </Text>
          {detail.thumbnailUrl ? (
            <img
              src={detail.thumbnailUrl}
              alt={detail.title}
              style={{ width: "100%", maxWidth: 720, border: "1px solid rgba(255,143,31,.45)" }}
            />
          ) : null}
          <Text style={{ whiteSpace: "pre-wrap", lineHeight: 1.55, textTransform: "none" }}>
            {formatSummaryForDisplay(detail.summary)}
          </Text>
          <Link href={detail.videoUrl} target="_blank" rel="noreferrer">
            Watch Source Video
          </Link>
        </Space>
      ) : null}

      {!loading && !error && !detail ? (
        <Space direction="vertical" className="full-width" size={10}>
          {items.map((item) => (
            <div key={item.id} className="column-card" style={{ width: "100%" }}>
              <Space direction="vertical" className="full-width" size={8}>
                <Link href={`/news/${encodeURIComponent(item.id)}`} style={{ textTransform: "none" }}>
                  {item.title}
                </Link>
                <Text style={{ color: "var(--muted)" }}>
                  {item.channelTitle || "-"} | {formatDateTime(item.updatedAt)}
                </Text>
                <Text style={{ whiteSpace: "pre-wrap", lineHeight: 1.5, textTransform: "none" }}>
                  {formatSummaryForDisplay(
                    item.summary.length > 280 ? `${item.summary.slice(0, 280)}...` : item.summary
                  )}
                </Text>
              </Space>
            </div>
          ))}
          {items.length === 0 ? <Text>No published items.</Text> : null}
        </Space>
      ) : null}
    </main>
  );
}
