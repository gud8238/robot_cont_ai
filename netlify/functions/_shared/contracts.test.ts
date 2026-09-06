import { describe, expect, it } from "vitest";
import {
  emotionSchema,
  emotionTurnRequestSchema,
  emotionTurnResultSchema,
  voiceCommandRequestSchema
} from "./contracts";
import { readServerEnv } from "./env";
import { parseJsonBody } from "./http";

const completeServerEnv = {
  GEMINI_API_KEY: "test-gemini-key",
  EMOTION_GAS_URL: "https://example.test/emotion",
  VOICE_GAS_URL: "https://example.test/voice",
  EMOTION_GAS_TOKEN: "test-emotion-token",
  VOICE_GAS_TOKEN: "test-voice-token"
};

describe("robot contracts", () => {
  it.each(["행복", "슬픔", "보통", "화남"])("accepts emotion %s", (value) => {
    expect(emotionSchema.parse(value)).toBe(value);
  });

  it("rejects an unsupported command", () => {
    expect(() => voiceCommandRequestSchema.parse({ source: "touch", command: "정지" })).toThrow();
  });

  it("bounds profile and history input", () => {
    const value = emotionTurnRequestSchema.parse({
      profile: { name: "민준", age: 10, honorific: "민준아" },
      history: [{ role: "user", text: "오늘 친구와 놀았어요." }]
    });
    expect(value.history).toHaveLength(1);
  });

  it("limits profile name and honorific to 30 characters", () => {
    expect(() => emotionTurnRequestSchema.parse({
      profile: { name: "가".repeat(31), age: 10, honorific: "민준아" },
      history: [{ role: "user", text: "오늘 친구와 놀았어요." }]
    })).toThrow();
    expect(() => emotionTurnRequestSchema.parse({
      profile: { name: "민준", age: 10, honorific: "가".repeat(31) },
      history: [{ role: "user", text: "오늘 친구와 놀았어요." }]
    })).toThrow();
  });

  it.each([3, 121])("rejects an age outside the inclusive 4 to 120 range: %s", (age) => {
    expect(() => emotionTurnRequestSchema.parse({
      profile: { name: "민준", age, honorific: "민준아" },
      history: [{ role: "user", text: "오늘 친구와 놀았어요." }]
    })).toThrow();
  });

  it("requires one to twelve history items", () => {
    const profile = { name: "민준", age: 10, honorific: "민준아" };
    const item = { role: "user" as const, text: "오늘 친구와 놀았어요." };

    expect(() => emotionTurnRequestSchema.parse({ profile, history: [] })).toThrow();
    expect(() => emotionTurnRequestSchema.parse({
      profile,
      history: Array.from({ length: 13 }, () => item)
    })).toThrow();
  });

  it("rejects history text longer than 800 characters", () => {
    expect(() => emotionTurnRequestSchema.parse({
      profile: { name: "민준", age: 10, honorific: "민준아" },
      history: [{ role: "user", text: "가".repeat(801) }]
    })).toThrow();
  });

  it("requires an emotion for a completed emotion turn", () => {
    expect(() => emotionTurnResultSchema.parse({
      reply: "기분을 알려주세요.",
      emotion: null,
      confidence: 0.9,
      complete: true
    })).toThrow();
  });
});

describe("server helpers", () => {
  it("parses a JSON request body", async () => {
    await expect(parseJsonBody(new Request("https://example.test", {
      method: "POST",
      body: JSON.stringify({ source: "touch", command: "전진" })
    }))).resolves.toEqual({ source: "touch", command: "전진" });
  });

  it("rejects malformed JSON without reflecting the body", async () => {
    const secretBody = '{"token":"private-body-value"';

    await expect(parseJsonBody(new Request("https://example.test", {
      method: "POST",
      body: secretBody
    }))).rejects.toThrow("Invalid JSON body");
  });

  it("returns every required server environment value", () => {
    expect(readServerEnv(completeServerEnv)).toEqual(completeServerEnv);
  });

  it("returns a generic configuration error without secret values", () => {
    const incompleteEnv = { ...completeServerEnv, VOICE_GAS_TOKEN: "" };

    expect(() => readServerEnv(incompleteEnv)).toThrow("Server configuration is invalid");
    expect(() => readServerEnv(incompleteEnv)).not.toThrow("test-gemini-key");
  });
});
