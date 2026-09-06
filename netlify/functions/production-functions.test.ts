import type { HandlerEvent, HandlerResponse } from "@netlify/functions";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const external = vi.hoisted(() => ({
  constructGoogleGenAI: vi.fn(),
  generateContent: vi.fn()
}));

vi.mock("@google/genai", () => ({
  GoogleGenAI: class {
    readonly models = { generateContent: external.generateContent };

    constructor() {
      external.constructGoogleGenAI();
    }
  }
}));

function postEvent(path: string, body: unknown): HandlerEvent {
  return {
    rawUrl: `https://example.test${path}`,
    rawQuery: "",
    path,
    httpMethod: "POST",
    headers: { "content-type": "application/json" },
    multiValueHeaders: {},
    queryStringParameters: null,
    multiValueQueryStringParameters: null,
    body: JSON.stringify(body),
    isBase64Encoded: false
  };
}

function parseBody(response: HandlerResponse | void): Record<string, unknown> {
  if (!response?.body) {
    throw new Error("Expected a JSON handler response");
  }
  return JSON.parse(response.body) as Record<string, unknown>;
}

function setSafeServerEnv(): void {
  vi.stubEnv("GEMINI_API_KEY", "safe-test-key");
  vi.stubEnv("EMOTION_GAS_URL", "https://example.test/emotion");
  vi.stubEnv("VOICE_GAS_URL", "https://example.test/voice");
  vi.stubEnv("EMOTION_GAS_TOKEN", "safe-emotion-token");
  vi.stubEnv("VOICE_GAS_TOKEN", "safe-voice-token");
}

describe("production Netlify function exports", () => {
  beforeEach(() => {
    vi.resetModules();
    external.constructGoogleGenAI.mockReset();
    external.generateContent.mockReset();
    setSafeServerEnv();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("composes the voice export with the real gateway and sanitizes malformed model JSON", async () => {
    const privateModelOutput = "private-production-model-output";
    external.generateContent.mockResolvedValue({ text: `{${privateModelOutput}` });
    const fetchBoundary = vi.fn();
    vi.stubGlobal("fetch", fetchBoundary);
    const { handler } = await import("./voice-command");

    const response = await handler(postEvent(
      "/.netlify/functions/voice-command",
      { source: "speech", transcript: "앞으로 가" }
    ), {} as never);

    expect(response?.statusCode).toBe(502);
    expect(parseBody(response)).toMatchObject({ code: "GEMINI_ERROR" });
    expect(response?.body).not.toContain(privateModelOutput);
    expect(fetchBoundary).not.toHaveBeenCalled();
  });

  it("wires the emotion export through Gemini, crypto request IDs, and the emotion GAS endpoint", async () => {
    const requestId = "11111111-1111-4111-8111-111111111111";
    external.generateContent.mockResolvedValue({
      text: JSON.stringify({
        reply: "오늘은 행복에 가까워 보여요.",
        emotion: "행복",
        confidence: 0.91,
        complete: true
      })
    });
    const fetchBoundary = vi.fn().mockImplementation(async () => new Response(
      JSON.stringify({ ok: true }),
      { status: 200, headers: { "Content-Type": "application/json" } }
    ));
    vi.stubGlobal("fetch", fetchBoundary);
    vi.spyOn(crypto, "randomUUID").mockReturnValue(requestId);
    const { handler } = await import("./emotion-turn");

    const response = await handler(postEvent(
      "/.netlify/functions/emotion-turn",
      {
        profile: { name: "민준", age: 10, honorific: "민준아" },
        history: [
          { role: "user", text: "첫 번째 이야기예요." },
          { role: "user", text: "두 번째 이야기예요." },
          { role: "user", text: "세 번째 이야기예요." }
        ]
      }
    ), {} as never);

    expect(response?.statusCode).toBe(200);
    expect(parseBody(response)).toMatchObject({ emotion: "행복", complete: true, saved: true });
    expect(fetchBoundary).toHaveBeenCalledOnce();
    expect(fetchBoundary.mock.calls[0]?.[0]).toBe("https://example.test/emotion");
    const request = JSON.parse(String(fetchBoundary.mock.calls[0]?.[1]?.body)) as Record<string, unknown>;
    expect(request).toMatchObject({ requestId, value: "행복" });
  });

  it("caches the production voice composition while issuing a fresh request ID per save", async () => {
    const firstRequestId = "22222222-2222-4222-8222-222222222222";
    const secondRequestId = "33333333-3333-4333-8333-333333333333";
    external.generateContent.mockResolvedValue({
      text: JSON.stringify({ command: "후진" })
    });
    const fetchBoundary = vi.fn().mockImplementation(async () => new Response(
      JSON.stringify({ ok: true }),
      { status: 200, headers: { "Content-Type": "application/json" } }
    ));
    vi.stubGlobal("fetch", fetchBoundary);
    vi.spyOn(crypto, "randomUUID")
      .mockReturnValueOnce(firstRequestId)
      .mockReturnValueOnce(secondRequestId);
    const { handler } = await import("./voice-command");
    const event = postEvent(
      "/.netlify/functions/voice-command",
      { source: "speech", transcript: "뒤로 가" }
    );

    const firstResponse = await handler(event, {} as never);
    const secondResponse = await handler(event, {} as never);

    expect(firstResponse?.statusCode).toBe(200);
    expect(secondResponse?.statusCode).toBe(200);
    expect(external.constructGoogleGenAI).toHaveBeenCalledOnce();
    expect(fetchBoundary).toHaveBeenCalledTimes(2);
    expect(fetchBoundary.mock.calls.map((call) => call[0])).toEqual([
      "https://example.test/voice",
      "https://example.test/voice"
    ]);
    const requestIds = fetchBoundary.mock.calls.map((call) => {
      const request = JSON.parse(String(call[1]?.body)) as Record<string, unknown>;
      return request.requestId;
    });
    expect(requestIds).toEqual([firstRequestId, secondRequestId]);
  });

  it("sanitizes production configuration failures", async () => {
    vi.stubEnv("VOICE_GAS_TOKEN", "");
    const privatePayload = "private-production-payload";
    const { handler } = await import("./voice-command");

    const response = await handler(postEvent(
      "/.netlify/functions/voice-command",
      { source: "speech", transcript: privatePayload }
    ), {} as never);

    expect(response?.statusCode).toBe(502);
    expect(parseBody(response)).toMatchObject({ code: "SERVICE_UNAVAILABLE" });
    expect(response?.body).not.toContain(privatePayload);
  });
});
