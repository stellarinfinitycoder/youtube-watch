import { describe, expect, it } from "vitest";
import { normalizeHandle, stripHandlePrefix } from "./handle";

describe("normalizeHandle", () => {
  it("accepts valid @handle values", () => {
    expect(normalizeHandle("@GoogleDevelopers")).toBe("@GoogleDevelopers");
    expect(normalizeHandle("@dev_team-01")).toBe("@dev_team-01");
  });

  it("rejects invalid handle values", () => {
    expect(() => normalizeHandle("GoogleDevelopers")).toThrow();
    expect(() => normalizeHandle("@ab")).toThrow();
    expect(() => normalizeHandle("@bad handle")).toThrow();
  });
});

describe("stripHandlePrefix", () => {
  it("removes @ prefix", () => {
    expect(stripHandlePrefix("@mychannel")).toBe("mychannel");
  });
});
