import { afterEach, describe, expect, it, vi } from "vitest";
import handler from "../../api/summarize";

const originalFetch = global.fetch;
const originalApiKey = process.env.OPENROUTER_API_KEY;

function createResponseRecorder() {
  const recorder = {
    statusCode: 200,
    payload: null as unknown,
    status(code: number) {
      recorder.statusCode = code;
      return recorder;
    },
    json(payload: unknown) {
      recorder.payload = payload;
      return recorder;
    }
  };
  return recorder;
}

describe("summarize api", () => {
  afterEach(() => {
    global.fetch = originalFetch;
    if (originalApiKey === undefined) {
      delete process.env.OPENROUTER_API_KEY;
    } else {
      process.env.OPENROUTER_API_KEY = originalApiKey;
    }
    vi.restoreAllMocks();
  });

  it("returns raw model output without parsing JSON-like content", async () => {
    process.env.OPENROUTER_API_KEY = "test-key";
    const rawSummary = [
      "{",
      '  "summary": "Keep this visible as raw text",',
      '  "keyPoints": ["Do not split this into bullets"]',
      "}"
    ].join("\n");
    global.fetch = vi.fn().mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        choices: [
          {
            message: {
              content: rawSummary
            }
          }
        ]
      })
    }) as typeof fetch;

    const req = {
      method: "POST",
      body: {
        videoId: "video-1",
        transcriptText: "Transcript body",
        prompt: "Return JSON-looking prose."
      }
    };
    const res = createResponseRecorder();

    await handler(req, res);

    expect(res.statusCode).toBe(200);
    expect(res.payload).toEqual({
      videoId: "video-1",
      model: "openai/gpt-4o-mini",
      summary: rawSummary,
      keyPoints: []
    });
  });
});
