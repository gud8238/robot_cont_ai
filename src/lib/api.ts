import { z } from "zod";
import type { EmotionTurnRequest } from "../../netlify/functions/_shared/contracts";

const emotionTurnResponseSchema = z.object({
  reply: z.string().trim().min(1).max(500),
  emotion: z.enum(["행복", "슬픔", "보통", "화남"]).nullable(),
  confidence: z.number().min(0).max(1),
  complete: z.boolean(),
  saved: z.boolean(),
}).superRefine((value, context) => {
  if (value.complete && value.emotion === null) {
    context.addIssue({ code: "custom", message: "A completed turn requires an emotion" });
  }
});

export type EmotionTurnResponse = z.infer<typeof emotionTurnResponseSchema>;

const apiErrorSchema = z.object({
  code: z.string(),
  message: z.string(),
  reply: z.string().trim().min(1).max(500).optional(),
  emotion: z.enum(["행복", "슬픔", "보통", "화남"]).nullable().optional(),
  confidence: z.number().min(0).max(1).optional(),
  complete: z.boolean().optional(),
  saved: z.boolean().optional(),
});

export class ApiError extends Error {
  readonly code: string;
  readonly response?: EmotionTurnResponse;

  constructor(code: string, message: string, response?: EmotionTurnResponse) {
    super(message);
    this.name = "ApiError";
    this.code = code;
    this.response = response;
  }
}

function parseSaveFailure(value: z.infer<typeof apiErrorSchema>): EmotionTurnResponse | undefined {
  const parsed = emotionTurnResponseSchema.safeParse(value);
  return parsed.success ? parsed.data : undefined;
}

export async function postEmotionTurn(request: EmotionTurnRequest): Promise<EmotionTurnResponse> {
  if (typeof navigator !== "undefined" && !navigator.onLine) {
    throw new ApiError("OFFLINE", "인터넷 연결을 확인한 뒤 다시 시도해 주세요.");
  }

  let response: Response;
  try {
    response = await fetch("/.netlify/functions/emotion-turn", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(request),
    });
  } catch {
    throw new ApiError("NETWORK_ERROR", "네트워크 연결을 확인한 뒤 다시 시도해 주세요.");
  }

  let body: unknown;
  try {
    body = await response.json();
  } catch {
    throw new ApiError("INVALID_RESPONSE", "서버 응답을 확인하지 못했어요. 다시 시도해 주세요.");
  }

  if (!response.ok) {
    const parsedError = apiErrorSchema.safeParse(body);
    if (parsedError.success) {
      throw new ApiError(
        parsedError.data.code,
        parsedError.data.message,
        parseSaveFailure(parsedError.data),
      );
    }
    throw new ApiError("REQUEST_FAILED", "요청을 처리하지 못했어요. 다시 시도해 주세요.");
  }

  const parsed = emotionTurnResponseSchema.safeParse(body);
  if (!parsed.success) {
    throw new ApiError("INVALID_RESPONSE", "서버 응답을 확인하지 못했어요. 다시 시도해 주세요.");
  }
  return parsed.data;
}

export type { EmotionTurnRequest };
