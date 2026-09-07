import { describe, expect, it, vi } from "vitest";
import type { HandlerEvent } from "@netlify/functions";
import type { EmotionTurnRequest } from "../../../netlify/functions/_shared/contracts";
import { createEmotionHandler } from "../../../netlify/functions/emotion-turn";

const validEmotionRequest: EmotionTurnRequest = {
  profile: { name: "민준", age: 10, honorific: "민준아" },
  history: [{ role: "user", text: "오늘 친구와 즐겁게 놀았어요." }]
};

function postEvent(body: unknown): HandlerEvent {
  return {
    rawUrl: "https://example.test/.netlify/functions/emotion-turn",
    rawQuery: "",
    path: "/.netlify/functions/emotion-turn",
    httpMethod: "POST",
    headers: { "content-type": "application/json" },
    multiValueHeaders: {},
    queryStringParameters: null,
    multiValueQueryStringParameters: null,
    body: JSON.stringify(body),
    isBase64Encoded: false
  };
}

function responseBody(response: { body: string }): Record<string, unknown> {
  return JSON.parse(response.body) as Record<string, unknown>;
}

describe("emotion-turn function", () => {
  it("saves an allowed emotion only when an emotion turn completes", async () => {
    const saveEmotion = vi.fn().mockResolvedValue(undefined);
    const handler = createEmotionHandler({
      getEmotionTurn: vi.fn().mockResolvedValue({
        reply: "오늘은 행복에 가까워 보여요.",
        emotion: "행복",
        confidence: 0.9,
        complete: true
      }),
      saveEmotion,
      createRequestId: () => "emotion-1"
    });

    const response = await handler(postEvent(validEmotionRequest));

    expect(response.statusCode).toBe(200);
    expect(responseBody(response)).toEqual({
      reply: "오늘은 행복에 가까워 보여요.",
      emotion: "행복",
      confidence: 0.9,
      complete: true,
      saved: true
    });
    expect(saveEmotion).toHaveBeenCalledWith("행복", "emotion-1");
  });

  it("does not save an incomplete emotion turn", async () => {
    const saveEmotion = vi.fn().mockResolvedValue(undefined);
    const createRequestId = vi.fn(() => "unused-request-id");
    const handler = createEmotionHandler({
      getEmotionTurn: vi.fn().mockResolvedValue({
        reply: "조금 더 이야기해 줄래요?",
        emotion: null,
        confidence: 0.4,
        complete: false
      }),
      saveEmotion,
      createRequestId
    });

    const response = await handler(postEvent(validEmotionRequest));

    expect(response.statusCode).toBe(200);
    expect(responseBody(response)).toMatchObject({ complete: false, saved: false });
    expect(saveEmotion).not.toHaveBeenCalled();
    expect(createRequestId).not.toHaveBeenCalled();
  });

  it("rejects non-POST methods before calling dependencies", async () => {
    const getEmotionTurn = vi.fn();
    const saveEmotion = vi.fn();
    const handler = createEmotionHandler({
      getEmotionTurn,
      saveEmotion,
      createRequestId: () => "emotion-2"
    });

    const response = await handler({ ...postEvent(validEmotionRequest), httpMethod: "GET" });

    expect(response.statusCode).toBe(405);
    expect(responseBody(response)).toMatchObject({ code: "METHOD_NOT_ALLOWED" });
    expect(getEmotionTurn).not.toHaveBeenCalled();
    expect(saveEmotion).not.toHaveBeenCalled();
  });

  it("rejects malformed JSON without reflecting supplied content", async () => {
    const privateContent = "private-profile-content";
    const handler = createEmotionHandler({
      getEmotionTurn: vi.fn(),
      saveEmotion: vi.fn(),
      createRequestId: () => "emotion-3"
    });
    const event = { ...postEvent(validEmotionRequest), body: `{\"name\":\"${privateContent}\"` };

    const response = await handler(event);

    expect(response.statusCode).toBe(400);
    expect(responseBody(response)).toMatchObject({ code: "INVALID_REQUEST" });
    expect(response.body).not.toContain(privateContent);
  });

  it("rejects non-JSON content and invalid request fields", async () => {
    const getEmotionTurn = vi.fn();
    const handler = createEmotionHandler({
      getEmotionTurn,
      saveEmotion: vi.fn(),
      createRequestId: () => "emotion-4"
    });
    const wrongContentType = {
      ...postEvent(validEmotionRequest),
      headers: { "content-type": "text/plain" }
    };

    const contentResponse = await handler(wrongContentType);
    const schemaResponse = await handler(postEvent({
      profile: { name: "", age: 2, honorific: "" },
      history: []
    }));

    expect(contentResponse.statusCode).toBe(400);
    expect(responseBody(contentResponse)).toMatchObject({ code: "INVALID_REQUEST" });
    expect(schemaResponse.statusCode).toBe(400);
    expect(responseBody(schemaResponse)).toMatchObject({ code: "INVALID_REQUEST" });
    expect(getEmotionTurn).not.toHaveBeenCalled();
  });

  it("maps Gemini failures and invalid model results to a safe 502 response", async () => {
    const rawError = "gemini-private-diagnostic";
    const rejectedHandler = createEmotionHandler({
      getEmotionTurn: vi.fn().mockRejectedValue(new Error(rawError)),
      saveEmotion: vi.fn(),
      createRequestId: () => "emotion-5"
    });
    const invalidHandler = createEmotionHandler({
      getEmotionTurn: vi.fn().mockResolvedValue({
        reply: "잘못된 감정이에요.",
        emotion: "놀람",
        confidence: 0.9,
        complete: true
      }),
      saveEmotion: vi.fn(),
      createRequestId: () => "emotion-6"
    });

    const rejectedResponse = await rejectedHandler(postEvent(validEmotionRequest));
    const invalidResponse = await invalidHandler(postEvent(validEmotionRequest));

    expect(rejectedResponse.statusCode).toBe(502);
    expect(responseBody(rejectedResponse)).toMatchObject({ code: "GEMINI_ERROR" });
    expect(rejectedResponse.body).not.toContain(rawError);
    expect(invalidResponse.statusCode).toBe(502);
    expect(responseBody(invalidResponse)).toMatchObject({ code: "GEMINI_ERROR" });
  });

  it("returns the completed emotion without raw GAS errors when saving fails", async () => {
    const rawError = "gas-token-and-upstream-body";
    const handler = createEmotionHandler({
      getEmotionTurn: vi.fn().mockResolvedValue({
        reply: "오늘은 슬픔에 가까워 보여요.",
        emotion: "슬픔",
        confidence: 0.8,
        complete: true
      }),
      saveEmotion: vi.fn().mockRejectedValue(new Error(rawError)),
      createRequestId: () => "emotion-7"
    });

    const response = await handler(postEvent(validEmotionRequest));

    expect(response.statusCode).toBe(502);
    expect(responseBody(response)).toMatchObject({
      code: "SAVE_FAILED",
      emotion: "슬픔",
      complete: true,
      saved: false
    });
    expect(response.body).not.toContain(rawError);
  });
});
