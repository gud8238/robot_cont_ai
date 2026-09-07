import type { HandlerEvent } from "@netlify/functions";
import { describe, expect, it, vi } from "vitest";
import { createEmotionSaveHandler } from "../../../netlify/functions/emotion-save";

function postEvent(body: unknown): HandlerEvent {
  return {
    rawUrl: "https://example.test/.netlify/functions/emotion-save",
    rawQuery: "",
    path: "/.netlify/functions/emotion-save",
    httpMethod: "POST",
    headers: { "content-type": "application/json" },
    multiValueHeaders: {},
    queryStringParameters: null,
    multiValueQueryStringParameters: null,
    body: JSON.stringify(body),
    isBase64Encoded: false,
  };
}

describe("emotion-save function", () => {
  it("saves the supplied finalized emotion without an analysis dependency", async () => {
    const saveEmotion = vi.fn().mockResolvedValue(undefined);
    const handler = createEmotionSaveHandler({
      saveEmotion,
      createRequestId: () => "emotion-retry-1",
    });

    const response = await handler(postEvent({ emotion: "행복" }));

    expect(response.statusCode).toBe(200);
    expect(JSON.parse(response.body)).toEqual({ emotion: "행복", saved: true });
    expect(saveEmotion).toHaveBeenCalledWith("행복", "emotion-retry-1");
  });

  it("rejects invalid emotions without writing", async () => {
    const saveEmotion = vi.fn();
    const handler = createEmotionSaveHandler({
      saveEmotion,
      createRequestId: () => "emotion-retry-2",
    });

    const response = await handler(postEvent({ emotion: "놀람" }));

    expect(response.statusCode).toBe(400);
    expect(JSON.parse(response.body)).toMatchObject({ code: "INVALID_REQUEST" });
    expect(saveEmotion).not.toHaveBeenCalled();
  });

  it("keeps the finalized emotion in a safe retryable save failure", async () => {
    const handler = createEmotionSaveHandler({
      saveEmotion: vi.fn().mockRejectedValue(new Error("private-upstream-error")),
      createRequestId: () => "emotion-retry-3",
    });

    const response = await handler(postEvent({ emotion: "슬픔" }));

    expect(response.statusCode).toBe(502);
    expect(JSON.parse(response.body)).toEqual({
      code: "SAVE_FAILED",
      message: "감정 결과를 저장하지 못했어요. 잠시 후 다시 전송해 주세요.",
      emotion: "슬픔",
      saved: false,
    });
    expect(response.body).not.toContain("private-upstream-error");
  });
});
