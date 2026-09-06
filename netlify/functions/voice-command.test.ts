import { describe, expect, it, vi } from "vitest";
import type { HandlerEvent } from "@netlify/functions";
import { createGeminiGateway, GeminiGatewayError } from "./_shared/gemini";
import { createVoiceHandler } from "./voice-command";

function postEvent(body: unknown): HandlerEvent {
  return {
    rawUrl: "https://example.test/.netlify/functions/voice-command",
    rawQuery: "",
    path: "/.netlify/functions/voice-command",
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

describe("voice-command function", () => {
  it("bypasses Gemini for a valid touch command", async () => {
    const classifyCommand = vi.fn();
    const saveCommand = vi.fn().mockResolvedValue(undefined);
    const handler = createVoiceHandler({
      classifyCommand,
      saveCommand,
      createRequestId: () => "voice-1"
    });

    const response = await handler(postEvent({ source: "touch", command: "전진" }));

    expect(response.statusCode).toBe(200);
    expect(responseBody(response)).toEqual({ command: "전진", saved: true });
    expect(classifyCommand).not.toHaveBeenCalled();
    expect(saveCommand).toHaveBeenCalledWith("전진", "voice-1");
  });

  it("classifies and saves a speech command", async () => {
    const classifyCommand = vi.fn().mockResolvedValue({ command: "좌회전" });
    const saveCommand = vi.fn().mockResolvedValue(undefined);
    const handler = createVoiceHandler({
      classifyCommand,
      saveCommand,
      createRequestId: () => "voice-2"
    });

    const response = await handler(postEvent({ source: "speech", transcript: "왼쪽으로 돌아" }));

    expect(response.statusCode).toBe(200);
    expect(responseBody(response)).toEqual({ command: "좌회전", saved: true });
    expect(classifyCommand).toHaveBeenCalledWith("왼쪽으로 돌아");
    expect(saveCommand).toHaveBeenCalledWith("좌회전", "voice-2");
  });

  it("rejects non-POST methods before calling dependencies", async () => {
    const classifyCommand = vi.fn();
    const saveCommand = vi.fn();
    const handler = createVoiceHandler({
      classifyCommand,
      saveCommand,
      createRequestId: () => "voice-3"
    });

    const response = await handler({
      ...postEvent({ source: "touch", command: "후진" }),
      httpMethod: "DELETE"
    });

    expect(response.statusCode).toBe(405);
    expect(responseBody(response)).toMatchObject({ code: "METHOD_NOT_ALLOWED" });
    expect(classifyCommand).not.toHaveBeenCalled();
    expect(saveCommand).not.toHaveBeenCalled();
  });

  it("rejects malformed JSON without reflecting supplied content", async () => {
    const privateContent = "private-transcript-content";
    const handler = createVoiceHandler({
      classifyCommand: vi.fn(),
      saveCommand: vi.fn(),
      createRequestId: () => "voice-4"
    });
    const event = { ...postEvent({}), body: `{\"transcript\":\"${privateContent}\"` };

    const response = await handler(event);

    expect(response.statusCode).toBe(400);
    expect(responseBody(response)).toMatchObject({ code: "INVALID_REQUEST" });
    expect(response.body).not.toContain(privateContent);
  });

  it("rejects non-JSON content and invalid touch commands", async () => {
    const classifyCommand = vi.fn();
    const saveCommand = vi.fn();
    const handler = createVoiceHandler({
      classifyCommand,
      saveCommand,
      createRequestId: () => "voice-5"
    });
    const wrongContentType = {
      ...postEvent({ source: "touch", command: "전진" }),
      headers: { "content-type": "text/plain" }
    };

    const contentResponse = await handler(wrongContentType);
    const commandResponse = await handler(postEvent({ source: "touch", command: "정지" }));

    expect(contentResponse.statusCode).toBe(400);
    expect(responseBody(contentResponse)).toMatchObject({ code: "INVALID_REQUEST" });
    expect(commandResponse.statusCode).toBe(400);
    expect(responseBody(commandResponse)).toMatchObject({ code: "INVALID_REQUEST" });
    expect(classifyCommand).not.toHaveBeenCalled();
    expect(saveCommand).not.toHaveBeenCalled();
  });

  it("returns 422 for an unsupported speech command without saving", async () => {
    const saveCommand = vi.fn();
    const handler = createVoiceHandler({
      classifyCommand: vi.fn().mockRejectedValue(new GeminiGatewayError()),
      saveCommand,
      createRequestId: () => "voice-6"
    });

    const response = await handler(postEvent({ source: "speech", transcript: "멈춰" }));

    expect(response.statusCode).toBe(422);
    expect(responseBody(response)).toMatchObject({ code: "UNSUPPORTED_COMMAND" });
    expect(saveCommand).not.toHaveBeenCalled();
  });

  it("maps malformed JSON from the real Gemini gateway to 502", async () => {
    const privateModelOutput = "private-model-output";
    const gateway = createGeminiGateway(
      "test-key",
      vi.fn().mockResolvedValue({ text: `{${privateModelOutput}` })
    );
    const saveCommand = vi.fn();
    const handler = createVoiceHandler({
      classifyCommand: gateway.classifyCommand,
      saveCommand,
      createRequestId: () => "voice-real-gateway"
    });

    const response = await handler(postEvent({ source: "speech", transcript: "앞으로 가" }));

    expect(response.statusCode).toBe(502);
    expect(responseBody(response)).toMatchObject({ code: "GEMINI_ERROR" });
    expect(response.body).not.toContain(privateModelOutput);
    expect(saveCommand).not.toHaveBeenCalled();
  });

  it("maps an explicit null from the real Gemini gateway to 422", async () => {
    const gateway = createGeminiGateway(
      "test-key",
      vi.fn().mockResolvedValue({ text: JSON.stringify({ command: null }) })
    );
    const saveCommand = vi.fn();
    const handler = createVoiceHandler({
      classifyCommand: gateway.classifyCommand,
      saveCommand,
      createRequestId: () => "voice-real-gateway-null"
    });

    const response = await handler(postEvent({ source: "speech", transcript: "알아서 움직여" }));

    expect(response.statusCode).toBe(422);
    expect(responseBody(response)).toMatchObject({ code: "UNSUPPORTED_COMMAND" });
    expect(saveCommand).not.toHaveBeenCalled();
  });

  it("maps other Gemini failures and invalid model results to safe 502 responses", async () => {
    const rawError = "gemini-api-private-diagnostic";
    const rejectedHandler = createVoiceHandler({
      classifyCommand: vi.fn().mockRejectedValue(new Error(rawError)),
      saveCommand: vi.fn(),
      createRequestId: () => "voice-7"
    });
    const invalidHandler = createVoiceHandler({
      classifyCommand: vi.fn().mockResolvedValue({ command: "정지" }),
      saveCommand: vi.fn(),
      createRequestId: () => "voice-8"
    });

    const rejectedResponse = await rejectedHandler(postEvent({ source: "speech", transcript: "앞으로" }));
    const invalidResponse = await invalidHandler(postEvent({ source: "speech", transcript: "앞으로" }));

    expect(rejectedResponse.statusCode).toBe(502);
    expect(responseBody(rejectedResponse)).toMatchObject({ code: "GEMINI_ERROR" });
    expect(rejectedResponse.body).not.toContain(rawError);
    expect(invalidResponse.statusCode).toBe(502);
    expect(responseBody(invalidResponse)).toMatchObject({ code: "GEMINI_ERROR" });
  });

  it("returns the classified command without raw GAS errors when saving fails", async () => {
    const rawError = "voice-gas-token-and-upstream-body";
    const handler = createVoiceHandler({
      classifyCommand: vi.fn().mockResolvedValue({ command: "우회전" }),
      saveCommand: vi.fn().mockRejectedValue(new Error(rawError)),
      createRequestId: () => "voice-9"
    });

    const response = await handler(postEvent({ source: "speech", transcript: "오른쪽으로 돌아" }));

    expect(response.statusCode).toBe(502);
    expect(responseBody(response)).toMatchObject({
      code: "SAVE_FAILED",
      command: "우회전",
      saved: false
    });
    expect(response.body).not.toContain(rawError);
  });
});
