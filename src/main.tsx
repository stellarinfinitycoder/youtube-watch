import React, { Suspense, lazy } from "react";
import ReactDOM from "react-dom/client";
import "antd/dist/reset.css";
import "./styles.css";
import App from "./App";
const PublisherAdminPage = lazy(() => import("./pages/PublisherAdminPage"));
const PublicNewsPage = lazy(() => import("./pages/PublicNewsPage"));

const faviconHref = import.meta.env.PROD ? "/svg/logo-prod.svg" : "/svg/logo-dev.svg";
const faviconLink =
  document.querySelector<HTMLLinkElement>("link[rel='icon']") ??
  document.createElement("link");
faviconLink.rel = "icon";
faviconLink.type = "image/svg+xml";
faviconLink.href = faviconHref;
if (!faviconLink.parentElement) {
  document.head.appendChild(faviconLink);
}

const pathname = window.location.pathname;
const isPublisherRoute =
  pathname.startsWith("/admin/rssfeed") || pathname.startsWith("/admin/publisher");
const isNewsRoute = pathname === "/news" || pathname.startsWith("/news/");

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    {isPublisherRoute ? (
      <Suspense fallback={<main className="app-shell">Loading...</main>}>
        <PublisherAdminPage />
      </Suspense>
    ) : isNewsRoute ? (
      <Suspense fallback={<main className="app-shell">Loading...</main>}>
        <PublicNewsPage />
      </Suspense>
    ) : (
      <App />
    )}
  </React.StrictMode>
);
