import { useEffect, useMemo, useRef, useState } from "react";
import { Button, Input, Modal, Space, Typography } from "antd";
import type { InputRef } from "antd";
import {
  deletePublisherItem,
  fetchPublicPublishedItems,
  fetchPublisherItems,
  loginPublisherAdmin,
  logoutPublisherAdmin,
  updatePublisherItem
} from "../api/publisher";
import type { PublishedItem } from "../types/publisher";

const { Title, Text, Link } = Typography;
const TOP_BAR_LOGO_SRC = import.meta.env.PROD ? "/svg/logo-prod.svg" : "/svg/logo-dev.svg";
const ICON_BUTTON_STYLE = { width: 32, minWidth: 32, padding: 0 } as const;

type AuthState = "checking" | "login" | "ready";

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

function formatDateCompact(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "--.--";
  }
  const dd = String(date.getDate()).padStart(2, "0");
  const mm = String(date.getMonth() + 1).padStart(2, "0");
  return `${dd}.${mm}`;
}

function formatDurationCompact(durationSeconds: number | null | undefined): string {
  if (typeof durationSeconds !== "number" || !Number.isFinite(durationSeconds)) {
    return "--:--";
  }
  const totalSeconds = Math.max(0, Math.floor(durationSeconds));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  if (hours > 0) {
    return `${hours}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
  }
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}

function formatViewCountCompact(value: number | null | undefined): string {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) {
    return "--";
  }
  if (value >= 1000000) {
    const next = value / 1000000;
    return `${next >= 10 ? Math.round(next) : Math.round(next * 10) / 10}m`;
  }
  if (value >= 1000) {
    const next = value / 1000;
    return `${next >= 10 ? Math.round(next) : Math.round(next * 10) / 10}k`;
  }
  return String(Math.floor(value));
}

function formatPublisherVideoMeta(item: PublishedItem): string {
  return `${formatDateCompact(item.publishedAt)} | ${formatDurationCompact(item.durationSeconds)} | ${formatViewCountCompact(item.viewCount)}`;
}

function formatChannelHandle(value: string): string {
  const normalized = value.trim();
  if (!normalized) {
    return "@channel";
  }
  if (normalized.startsWith("@")) {
    return normalized.replace(/\s+/g, "");
  }
  const preferred = normalized.includes("|")
    ? normalized
        .split("|")
        .map((part) => part.trim())
        .filter(Boolean)
        .at(-1) ?? normalized
    : normalized;
  const compact = preferred.replace(/[^a-zA-Z0-9]/g, "");
  return `@${compact || "channel"}`;
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

export default function PublisherAdminPage() {
  const [authState, setAuthState] = useState<AuthState>("checking");
  const [password, setPassword] = useState("");
  const [loginModalOpen, setLoginModalOpen] = useState(false);
  const [items, setItems] = useState<PublishedItem[]>([]);
  const [isReloading, setIsReloading] = useState(false);
  const [isLoggingOut, setIsLoggingOut] = useState(false);
  const [isLoggingIn, setIsLoggingIn] = useState(false);
  const [isSavingEdit, setIsSavingEdit] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [titleDraft, setTitleDraft] = useState("");
  const [summaryDraft, setSummaryDraft] = useState("");
  const loginPasswordInputRef = useRef<InputRef | null>(null);
  const editingItem = useMemo(
    () => items.find((item) => item.id === editingId) ?? null,
    [editingId, items]
  );

  const pageWidthStyle = { width: "100%", maxWidth: 500, margin: "0 auto" } as const;

  const loadPublicItems = async (options?: { showReloadUi?: boolean }): Promise<void> => {
    if (options?.showReloadUi) {
      setIsReloading(true);
    }
    setError(null);
    try {
      const next = await fetchPublicPublishedItems(200);
      setItems(next);
      setAuthState("login");
    } catch (loadError) {
      const message = loadError instanceof Error ? loadError.message : "Failed to load.";
      setError(message);
    } finally {
      if (options?.showReloadUi) {
        setIsReloading(false);
      }
    }
  };

  const loadItems = async (options?: { showReloadUi?: boolean }): Promise<void> => {
    if (options?.showReloadUi) {
      setIsReloading(true);
    }
    setError(null);
    try {
      const next = await fetchPublisherItems();
      setItems(next);
      setAuthState("ready");
    } catch (loadError) {
      const message = loadError instanceof Error ? loadError.message : "Failed to load.";
      if (/unauthorized/i.test(message)) {
        setError(null);
        try {
          const publicList = await fetchPublicPublishedItems(200);
          setItems(publicList);
        } catch (publicError) {
          const publicMessage =
            publicError instanceof Error ? publicError.message : "Failed to load.";
          setError(publicMessage);
          setItems([]);
        }
        setAuthState("login");
      } else {
        setError(message);
        setAuthState("login");
      }
    } finally {
      if (options?.showReloadUi) {
        setIsReloading(false);
      }
    }
  };

  useEffect(() => {
    void loadItems();
  }, []);

  const submitLogin = async (): Promise<void> => {
    setIsLoggingIn(true);
    setError(null);
    try {
      await loginPublisherAdmin(password);
      setPassword("");
      setLoginModalOpen(false);
      await loadItems();
    } catch (loginError) {
      const message = loginError instanceof Error ? loginError.message : "Login failed.";
      setError(message);
      setAuthState("login");
      setIsLoggingIn(false);
    } finally {
      setIsLoggingIn(false);
    }
  };

  const handleLogout = async (): Promise<void> => {
    setIsLoggingOut(true);
    setError(null);
    try {
      await logoutPublisherAdmin();
      await loadPublicItems();
    } catch (logoutError) {
      const message = logoutError instanceof Error ? logoutError.message : "Logout failed.";
      setError(message);
    } finally {
      setIsLoggingOut(false);
    }
  };

  const openEdit = (item: PublishedItem): void => {
    setEditingId(item.id);
    setTitleDraft(item.title);
    setSummaryDraft(item.summary);
  };

  const submitEdit = async (): Promise<void> => {
    if (!editingItem) {
      return;
    }
    setIsSavingEdit(true);
    setError(null);
    try {
      const next = await updatePublisherItem(editingItem.id, {
        title: titleDraft,
        summary: summaryDraft
      });
      setItems((previous) => previous.map((item) => (item.id === next.id ? next : item)));
      setEditingId(null);
    } catch (updateError) {
      const message = updateError instanceof Error ? updateError.message : "Update failed.";
      setError(message);
    } finally {
      setIsSavingEdit(false);
    }
  };

  const askDelete = (item: PublishedItem): void => {
    Modal.confirm({
      icon: null,
      title: <span style={{ color: "var(--text)", fontWeight: 700 }}>DELETE POST</span>,
      content: (
        <span style={{ color: "var(--text)" }}>Delete {formatDateTime(item.updatedAt)} post?</span>
      ),
      okText: "Delete",
      cancelText: "Cancel",
      okButtonProps: { danger: true },
      onOk: async () => {
        setIsDeleting(true);
        setError(null);
        try {
          await deletePublisherItem(item.id);
          setItems((previous) => previous.filter((entry) => entry.id !== item.id));
        } catch (deleteError) {
          const message =
            deleteError instanceof Error ? deleteError.message : "Delete failed.";
          setError(message);
        } finally {
          setIsDeleting(false);
        }
      }
    });
  };

  if (authState === "checking") {
    return (
      <main className="app-shell">
        <div className="columns-nav" style={{ marginBottom: 10 }}>
          <img src={TOP_BAR_LOGO_SRC} alt="Logo" className="top-bar-logo" />
          <Text
            style={{
              color: "var(--text-strong)",
              marginLeft: 8,
              textTransform: "uppercase",
              fontWeight: 400
            }}
          >
            RSS FEED LOADING...
          </Text>
        </div>
      </main>
    );
  }

  const isAuthorized = authState === "ready";
  const handleTopReload = (): void => {
    if (isAuthorized) {
      void loadItems({ showReloadUi: true });
      return;
    }
    void loadPublicItems({ showReloadUi: true });
  };

  return (
    <main className="app-shell">
      <div className="columns-nav" style={{ marginBottom: 10 }}>
        <img
          src={TOP_BAR_LOGO_SRC}
          alt="Logo"
          className={`top-bar-logo ${isReloading ? "is-spinning" : ""}`}
        />
        <Text style={{ color: "var(--text-strong)", marginLeft: 8 }}>RSS FEED</Text>
        <Button
          className="nav-btn"
          style={{ ...ICON_BUTTON_STYLE, marginLeft: "auto" }}
          onClick={handleTopReload}
          disabled={isReloading}
          aria-label="Reload feed"
        >
          {isReloading ? (
            <span className="btn-icon btn-icon-fetch is-spinning" aria-hidden />
          ) : (
            <span className="btn-icon btn-icon-fetch" aria-hidden />
          )}
        </Button>
        {isAuthorized ? (
          <Button
            className="nav-btn"
            onClick={() => void handleLogout()}
            disabled={isLoggingOut}
            aria-label="Logout"
            style={ICON_BUTTON_STYLE}
          >
            {isLoggingOut ? (
              <span className="btn-icon btn-icon-logout is-spinning" aria-hidden />
            ) : (
              <span className="btn-icon btn-icon-logout" aria-hidden />
            )}
          </Button>
        ) : (
          <Button
            className="nav-btn"
            onClick={() => setLoginModalOpen(true)}
            disabled={isLoggingIn}
            aria-label="Login"
            style={ICON_BUTTON_STYLE}
          >
            {isLoggingIn ? (
              <span className="btn-icon btn-icon-login is-spinning" aria-hidden />
            ) : (
              <span className="btn-icon btn-icon-login" aria-hidden />
            )}
          </Button>
        )}
      </div>
      <div style={pageWidthStyle}>
        {error && isAuthorized ? (
          <Text type="danger" style={{ display: "block", marginBottom: 10 }}>
            {error}
          </Text>
        ) : null}
        {isReloading ? (
          <Text style={{ display: "block", color: "var(--muted)" }}>RELOADING...</Text>
        ) : (
          <Space direction="vertical" className="full-width" size={10}>
            {items.map((item) => (
              <div key={item.id} className="column-card" style={{ width: "100%" }}>
                <Space direction="vertical" className="full-width" size={8}>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
                    <Text style={{ color: "var(--muted)" }}>
                      <span style={{ color: "var(--amber)" }}>{formatDateTime(item.updatedAt)}</span>{" "}
                      {formatChannelHandle(item.channelTitle)} | {formatPublisherVideoMeta(item)}
                    </Text>
                    {authState === "ready" ? (
                      <Space size={8}>
                        <Button
                          className="nav-btn"
                          onClick={() => openEdit(item)}
                          aria-label="Edit item"
                          style={ICON_BUTTON_STYLE}
                        >
                          <span className="btn-icon btn-icon-edit-board" aria-hidden />
                        </Button>
                        <Button
                          className="nav-btn red-outline-btn"
                          onClick={() => askDelete(item)}
                          aria-label="Delete item"
                          style={ICON_BUTTON_STYLE}
                        >
                          <span className="btn-icon btn-icon-delete" aria-hidden />
                        </Button>
                      </Space>
                    ) : null}
                  </div>
                  {item.thumbnailUrl ? (
                    <Link
                      href={item.videoUrl}
                      target="_blank"
                      rel="noreferrer"
                      style={{ width: "100%", lineHeight: 0 }}
                    >
                      <img
                        src={item.thumbnailUrl}
                        alt={item.title}
                        style={{
                          width: "100%",
                          border: "1px solid rgba(255,143,31,.45)",
                          display: "block"
                        }}
                      />
                    </Link>
                  ) : null}
                  <Link href={item.videoUrl} target="_blank" rel="noreferrer" style={{ width: "100%" }}>
                    <Title
                      level={5}
                      style={{ margin: 0, color: "var(--text-strong)", textTransform: "uppercase" }}
                    >
                      {item.title}
                    </Title>
                  </Link>
                  <Text
                    style={{
                      whiteSpace: "pre-wrap",
                      lineHeight: 1.55,
                      color: "var(--text)",
                      textTransform: "none"
                    }}
                  >
                    {formatSummaryForDisplay(item.summary)}
                  </Text>
                </Space>
              </div>
            ))}
            {items.length === 0 ? <Text>No published items.</Text> : null}
          </Space>
        )}
      </div>

      <Modal
        title="Admin Login"
        open={loginModalOpen}
        onCancel={() => setLoginModalOpen(false)}
        onOk={() => void submitLogin()}
        okText="Login"
        okButtonProps={{ disabled: isLoggingIn }}
        afterOpenChange={(open) => {
          if (!open) {
            return;
          }
          window.setTimeout(() => {
            loginPasswordInputRef.current?.focus({ cursor: "all" });
          }, 0);
        }}
      >
        <Space direction="vertical" className="full-width" size={10}>
          <Input
            type="password"
            ref={loginPasswordInputRef}
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            placeholder="Admin password"
            onPressEnter={() => void submitLogin()}
          />
          {error && !isAuthorized ? <Text type="danger">{error}</Text> : null}
        </Space>
      </Modal>

      <Modal
        title="Edit Published Video"
        className="publisher-edit-modal"
        open={!!editingItem}
        onCancel={() => setEditingId(null)}
        onOk={() => void submitEdit()}
        okText="Save"
        confirmLoading={isSavingEdit}
      >
        <Space direction="vertical" className="full-width" size={10}>
          <Input
            value={titleDraft}
            onChange={(event) => setTitleDraft(event.target.value)}
            placeholder="Title"
          />
          <Input.TextArea
            value={summaryDraft}
            onChange={(event) => setSummaryDraft(event.target.value)}
            autoSize={{ minRows: 8, maxRows: 18 }}
            placeholder="Summary"
          />
        </Space>
      </Modal>
    </main>
  );
}
