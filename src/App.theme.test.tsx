import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import App from "./App";
import { APP_THEME_STORAGE_KEY } from "./theme";

const originalFetch = global.fetch;

describe("App theme", () => {
  beforeEach(() => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({})
    } as Response) as typeof fetch;
    window.localStorage.clear();
    delete document.documentElement.dataset.theme;
  });

  afterEach(() => {
    global.fetch = originalFetch;
    delete document.documentElement.dataset.theme;
  });

  it("applies the stored lite theme and persists a settings-menu toggle", async () => {
    window.localStorage.setItem(APP_THEME_STORAGE_KEY, "lite");

    render(<App />);

    await waitFor(() => {
      expect(document.documentElement.dataset.theme).toBe("lite");
    });

    fireEvent.click(screen.getByRole("button", { name: "Open maintenance menu" }));
    fireEvent.click(await screen.findByText("SWITCH TO DARK"));

    await waitFor(() => {
      expect(document.documentElement.dataset.theme).toBeUndefined();
      expect(window.localStorage.getItem(APP_THEME_STORAGE_KEY)).toBe("dark");
    });
  });
});
