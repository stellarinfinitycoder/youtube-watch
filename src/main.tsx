import React from "react";
import ReactDOM from "react-dom/client";
import "antd/dist/reset.css";
import "./styles.css";
import App from "./App";

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

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
