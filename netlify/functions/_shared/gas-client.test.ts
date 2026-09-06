import { describe, expect, it, vi } from "vitest";
import type { Command, Emotion } from "./contracts";
import { createGasClient, GasClientError, type GasFetch } from "./gas-client";

const config = {
  emotionUrl: "https://example.test/emotion",
  emotionToken: "emotion-secret",
  voiceUrl: "https://example.test/voice",
  voiceToken: "voice-secret"
};

function successfulFetch(body: unknown = { ok: true }): GasFetch {
  return vi.fn().mockResolvedValue(new Response(JSON.stringify(body), {
    status: 200,
    headers: { "Content-Type": "application/json" }
  }));
}

describe("GAS client", () => {
  it("posts an emotion with its server-side secret and follows redirects", async () => {
    const fetchImpl = successfulFetch();
    const client = createGasClient(config, fetchImpl);

    await client.saveEmotion("행복" satisfies Emotion, "emotion-1");

    expect(fetchImpl).toHaveBeenCalledWith("https://example.test/emotion", expect.objectContaining({
      method: "POST",
      redirect: "follow",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        token: "emotion-secret",
        requestId: "emotion-1",
        value: "행복"
      })
    }));
  });

  it("posts a command only to the voice writer with its separate secret", async () => {
    const fetchImpl = successfulFetch();
    const client = createGasClient(config, fetchImpl);

    await client.saveCommand("좌회전" satisfies Command, "voice-1");

    expect(fetchImpl).toHaveBeenCalledWith("https://example.test/voice", expect.objectContaining({
      body: JSON.stringify({
        token: "voice-secret",
        requestId: "voice-1",
        value: "좌회전"
      })
    }));
  });

  it("enforces an eight-second timeout signal", async () => {
    const timeoutSignal = new AbortController().signal;
    const timeout = vi.spyOn(AbortSignal, "timeout").mockReturnValue(timeoutSignal);
    const fetchImpl = successfulFetch();

    try {
      await createGasClient(config, fetchImpl).saveEmotion("보통", "emotion-2");
      expect(timeout).toHaveBeenCalledWith(8000);
      expect(fetchImpl).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({ signal: timeoutSignal })
      );
    } finally {
      timeout.mockRestore();
    }
  });

  it("rejects a non-success HTTP response without exposing its body or token", async () => {
    const fetchImpl: GasFetch = vi.fn().mockResolvedValue(new Response(
      "upstream-body-secret",
      { status: 403 }
    ));

    const promise = createGasClient(config, fetchImpl).saveEmotion("화남", "emotion-3");

    await expect(promise).rejects.toMatchObject({ code: "HTTP_ERROR" });
    await expect(promise).rejects.not.toThrow(/upstream-body-secret|emotion-secret/);
  });

  it.each([
    ["malformed JSON", new Response("not-json", { status: 200 })],
    ["a negative GAS result", new Response(JSON.stringify({ ok: false, code: "INVALID_REQUEST" }), { status: 200 })],
    ["an unrelated JSON value", new Response(JSON.stringify({ status: "ok" }), { status: 200 })]
  ])("rejects %s with a stable typed error", async (_case, response) => {
    const fetchImpl: GasFetch = vi.fn().mockResolvedValue(response);

    await expect(
      createGasClient(config, fetchImpl).saveCommand("전진", "voice-2")
    ).rejects.toEqual(expect.objectContaining({
      name: "GasClientError",
      code: "INVALID_RESPONSE"
    }));
  });

  it("maps an aborted fetch to a timeout code without retaining the raw error", async () => {
    const fetchImpl: GasFetch = vi.fn().mockRejectedValue(
      new DOMException("request carried emotion-secret", "TimeoutError")
    );

    const promise = createGasClient(config, fetchImpl).saveEmotion("슬픔", "emotion-4");

    await expect(promise).rejects.toBeInstanceOf(GasClientError);
    await expect(promise).rejects.toMatchObject({ code: "TIMEOUT" });
    await expect(promise).rejects.not.toThrow(/emotion-secret/);
  });

  it("maps other network failures to a stable request-failed code", async () => {
    const fetchImpl: GasFetch = vi.fn().mockRejectedValue(new Error("voice-secret leaked"));

    const promise = createGasClient(config, fetchImpl).saveCommand("우회전", "voice-3");

    await expect(promise).rejects.toMatchObject({ code: "REQUEST_FAILED" });
    await expect(promise).rejects.not.toThrow(/voice-secret/);
  });
});
