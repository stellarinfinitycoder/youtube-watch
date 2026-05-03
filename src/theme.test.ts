import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  APP_THEME_STORAGE_KEY,
  getNextAppTheme,
  normalizeAppTheme,
  readStoredAppTheme,
  writeStoredAppTheme
} from "./theme";

describe("theme storage", () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it("falls back to dark for missing or invalid values", () => {
    expect(readStoredAppTheme()).toBe("dark");
    expect(normalizeAppTheme("unknown")).toBe("dark");

    window.localStorage.setItem(APP_THEME_STORAGE_KEY, "unknown");

    expect(readStoredAppTheme()).toBe("dark");
  });

  it("reads and writes the persisted theme", () => {
    writeStoredAppTheme("lite");

    expect(window.localStorage.getItem(APP_THEME_STORAGE_KEY)).toBe("lite");
    expect(readStoredAppTheme()).toBe("lite");
  });

  it("ignores storage failures", () => {
    const getItemSpy = vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("storage unavailable");
    });
    const setItemSpy = vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("storage unavailable");
    });

    expect(readStoredAppTheme()).toBe("dark");
    expect(() => writeStoredAppTheme("lite")).not.toThrow();

    getItemSpy.mockRestore();
    setItemSpy.mockRestore();
  });

  it("toggles to the other app theme", () => {
    expect(getNextAppTheme("dark")).toBe("lite");
    expect(getNextAppTheme("lite")).toBe("dark");
  });
});
