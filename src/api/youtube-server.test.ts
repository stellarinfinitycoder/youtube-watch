import { describe, expect, it } from "vitest";
import { formatSimilarVideoMatchReason } from "../../api/_lib/youtube";

describe("youtube server discovery helpers", () => {
  it("formats manual seed match reasons", () => {
    expect(
      formatSimilarVideoMatchReason(
        {
          query: "edited ai channels",
          source: "manual",
          sourceTitle: "Active Seed Video about agents"
        },
        1
      )
    ).toBe("Matched search seed: Active Seed Video about agents");
  });
});
