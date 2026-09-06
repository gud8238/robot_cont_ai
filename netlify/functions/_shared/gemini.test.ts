import { describe, expect, it, vi } from "vitest";
import type { EmotionTurnRequest } from "./contracts";
import { createGeminiGateway, type GenerateContent } from "./gemini";

const profile = { name: "민준", age: 10, honorific: "민준아" };

function requestWithUserUtterances(count: number): EmotionTurnRequest {
  return {
    profile,
    history: Array.from({ length: count }, (_, index) => ({
      role: "user" as const,
      text: `${index + 1}번째 이야기예요.`
    }))
  };
}

function fakeGenerate(body: unknown): GenerateContent {
  return vi.fn().mockResolvedValue({ text: JSON.stringify(body) });
}

describe("Gemini gateway", () => {
  it("forces the best emotion on the sixth user utterance", async () => {
    const gateway = createGeminiGateway("test-key", fakeGenerate({
      reply: "지금 마음은 평온함에 가까워 보여요.",
      emotion: "보통",
      confidence: 0.72,
      complete: false
    }));

    const result = await gateway.getEmotionTurn(requestWithUserUtterances(6));

    expect(result).toMatchObject({ emotion: "보통", complete: true });
  });

  it("defers completion until at least three user utterances", async () => {
    const gateway = createGeminiGateway("test-key", fakeGenerate({
      reply: "조금 더 이야기해 줄래요?",
      emotion: "행복",
      confidence: 0.81,
      complete: true
    }));

    const result = await gateway.getEmotionTurn(requestWithUserUtterances(2));

    expect(result.complete).toBe(false);
  });

  it("counts user utterances rather than every history item", async () => {
    const gateway = createGeminiGateway("test-key", fakeGenerate({
      reply: "이야기를 조금 더 들려줄래요?",
      emotion: "보통",
      confidence: 0.65,
      complete: false
    }));
    const request: EmotionTurnRequest = {
      profile,
      history: [
        { role: "user", text: "첫 번째 이야기예요." },
        { role: "assistant", text: "그랬군요." },
        { role: "user", text: "두 번째 이야기예요." },
        { role: "assistant", text: "더 들려주세요." },
        { role: "user", text: "세 번째 이야기예요." },
        { role: "assistant", text: "고마워요." }
      ]
    };

    const result = await gateway.getEmotionTurn(request);

    expect(result.complete).toBe(false);
  });

  it("uses the fixed model and strict emotion JSON response contract", async () => {
    const generate = fakeGenerate({
      reply: "기분을 더 들려줄래요?",
      emotion: null,
      confidence: 0.4,
      complete: false
    });
    const gateway = createGeminiGateway("test-key", generate);

    await gateway.getEmotionTurn(requestWithUserUtterances(3));

    expect(generate).toHaveBeenCalledOnce();
    expect(generate).toHaveBeenCalledWith(expect.objectContaining({
      model: "gemini-3.6-flash",
      contents: expect.stringContaining("민준아"),
      config: expect.objectContaining({
        responseMimeType: "application/json",
        responseJsonSchema: expect.objectContaining({
          additionalProperties: false,
          required: ["reply", "emotion", "confidence", "complete"]
        })
      })
    }));
  });

  it("uses only supported wire constraints for strings and booleans", async () => {
    const generate = fakeGenerate({
      reply: "조금 더 이야기해 줄래요?",
      emotion: null,
      confidence: 0.4,
      complete: false
    });
    const gateway = createGeminiGateway("test-key", generate);

    await gateway.getEmotionTurn(requestWithUserUtterances(2));

    expect(generate).toHaveBeenCalledWith(expect.objectContaining({
      config: expect.objectContaining({
        responseJsonSchema: expect.objectContaining({
          properties: expect.objectContaining({
            reply: { type: "string" },
            complete: { type: "boolean" }
          })
        })
      })
    }));
  });

  it("requires an allowed emotion in the sixth-turn wire schema", async () => {
    const generate = fakeGenerate({
      reply: "지금 마음은 평온함에 가까워 보여요.",
      emotion: "보통",
      confidence: 0.72,
      complete: true
    });
    const gateway = createGeminiGateway("test-key", generate);

    await gateway.getEmotionTurn(requestWithUserUtterances(6));

    expect(generate).toHaveBeenCalledWith(expect.objectContaining({
      config: expect.objectContaining({
        responseJsonSchema: expect.objectContaining({
          properties: expect.objectContaining({
            emotion: {
              type: "string",
              enum: ["행복", "슬픔", "보통", "화남"]
            },
            complete: { type: "boolean" }
          })
        })
      })
    }));
  });

  it("allows only null or the exact emotion enum during turns three through five", async () => {
    const generate = fakeGenerate({
      reply: "오늘 마음을 한 번 더 표현해 줄래요?",
      emotion: null,
      confidence: 0.6,
      complete: false
    });
    const gateway = createGeminiGateway("test-key", generate);

    await gateway.getEmotionTurn(requestWithUserUtterances(4));

    expect(generate).toHaveBeenCalledWith(expect.objectContaining({
      config: expect.objectContaining({
        responseJsonSchema: expect.objectContaining({
          properties: expect.objectContaining({
            emotion: {
              anyOf: [
                { type: "string", enum: ["행복", "슬픔", "보통", "화남"] },
                { type: "null" }
              ]
            },
            complete: { type: "boolean" }
          })
        })
      })
    }));
  });

  it("tells the model that completion and a non-null emotion are inseparable", async () => {
    const generate = fakeGenerate({
      reply: "오늘 마음을 한 번 더 표현해 줄래요?",
      emotion: "보통",
      confidence: 0.7,
      complete: true
    });
    const gateway = createGeminiGateway("test-key", generate);

    await gateway.getEmotionTurn(requestWithUserUtterances(4));

    expect(generate).toHaveBeenCalledWith(expect.objectContaining({
      contents: expect.stringMatching(
        /complete가 true이면 emotion은 null이 아닌.*emotion이 null이면 complete는 반드시 false/
      )
    }));
  });

  it("includes the core empathetic and safety rules in the emotion prompt", async () => {
    const generate = fakeGenerate({
      reply: "조금 더 이야기해 줄래요?",
      emotion: null,
      confidence: 0.4,
      complete: false
    });
    const gateway = createGeminiGateway("test-key", generate);

    await gateway.getEmotionTurn(requestWithUserUtterances(3));

    expect(generate).toHaveBeenCalledWith(expect.objectContaining({
      contents: expect.stringMatching(
        /정확히 하나의 공감 질문[\s\S]*민준아[\s\S]*진단처럼 단정하지 마세요/
      )
    }));
    expect(generate).toHaveBeenCalledWith(expect.objectContaining({
      contents: expect.stringMatching(/믿을 수 있는 어른.*긴급 서비스/)
    }));
  });

  it("uses a strict command JSON response contract", async () => {
    const generate = fakeGenerate({ command: "좌회전" });
    const gateway = createGeminiGateway("test-key", generate);

    await expect(gateway.classifyCommand("왼쪽으로 돌아")).resolves.toEqual({ command: "좌회전" });
    expect(generate).toHaveBeenCalledWith(expect.objectContaining({
      model: "gemini-3.6-flash",
      config: {
        responseMimeType: "application/json",
        responseJsonSchema: expect.objectContaining({
          type: "object",
          additionalProperties: false,
          required: ["command"]
        })
      }
    }));
  });

  it("rejects model output outside the command allowlist", async () => {
    const gateway = createGeminiGateway("test-key", fakeGenerate({ command: "정지" }));

    await expect(gateway.classifyCommand("멈춰")).rejects.toMatchObject({
      code: "UNSUPPORTED_COMMAND"
    });
  });

  it("returns the same stable error for ambiguous command output", async () => {
    const gateway = createGeminiGateway("test-key", fakeGenerate({ command: null }));

    await expect(gateway.classifyCommand("알아서 움직여")).rejects.toMatchObject({
      code: "UNSUPPORTED_COMMAND",
      message: "지원하지 않는 명령입니다."
    });
  });

  it("retries a transient Gemini failure exactly once", async () => {
    const transientError = Object.assign(new Error("service unavailable"), { status: 503 });
    const generate = vi.fn<GenerateContent>()
      .mockRejectedValueOnce(transientError)
      .mockResolvedValueOnce({ text: JSON.stringify({ command: "전진" }) });
    const gateway = createGeminiGateway("test-key", generate);

    await expect(gateway.classifyCommand("앞으로 가")).resolves.toEqual({ command: "전진" });
    expect(generate).toHaveBeenCalledTimes(2);
  });

  it("stops after the single retry when a transient failure persists", async () => {
    const transientError = Object.assign(new Error("service unavailable"), { status: 503 });
    const generate = vi.fn<GenerateContent>().mockRejectedValue(transientError);
    const gateway = createGeminiGateway("test-key", generate);

    await expect(gateway.classifyCommand("앞으로 가")).rejects.toBe(transientError);
    expect(generate).toHaveBeenCalledTimes(2);
  });

  it("retries a wrapped fetch transport failure exactly once", async () => {
    const socketError = Object.assign(new Error("socket closed"), { code: "ECONNRESET" });
    const wrappedError = Object.assign(new TypeError("fetch failed"), { cause: socketError });
    const generate = vi.fn<GenerateContent>().mockRejectedValue(wrappedError);
    const gateway = createGeminiGateway("test-key", generate);

    await expect(gateway.classifyCommand("앞으로 가")).rejects.toBe(wrappedError);
    expect(generate).toHaveBeenCalledTimes(2);
  });

  it("does not retry malformed structured output", async () => {
    const generate = vi.fn<GenerateContent>().mockResolvedValue({ text: "not-json" });
    const gateway = createGeminiGateway("test-key", generate);

    await expect(gateway.getEmotionTurn(requestWithUserUtterances(3))).rejects.toBeInstanceOf(SyntaxError);
    expect(generate).toHaveBeenCalledOnce();
  });

  it("does not retry Zod-invalid structured output", async () => {
    const generate = fakeGenerate({
      reply: "",
      emotion: "보통",
      confidence: 0.7,
      complete: true
    });
    const gateway = createGeminiGateway("test-key", generate);

    await expect(gateway.getEmotionTurn(requestWithUserUtterances(4))).rejects.toMatchObject({
      name: "ZodError"
    });
    expect(generate).toHaveBeenCalledOnce();
  });

  it("does not log request or model data", async () => {
    const log = vi.spyOn(console, "log").mockImplementation(() => undefined);
    const gateway = createGeminiGateway("test-key", fakeGenerate({ command: "우회전" }));

    try {
      await gateway.classifyCommand("오른쪽으로 돌아");
      expect(log).not.toHaveBeenCalled();
    } finally {
      log.mockRestore();
    }
  });
});
