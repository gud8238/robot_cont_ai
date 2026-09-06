import { z } from "zod";
import type {
  Emotion,
  EmotionTurnRequest,
  VoiceCommandRequest,
} from "../../netlify/functions/_shared/contracts";

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

const emotionSaveResponseSchema = z.object({
  emotion: z.enum(["행복", "슬픔", "보통", "화남"]),
  saved: z.literal(true),
});

export type EmotionSaveResponse = z.infer<typeof emotionSaveResponseSchema>;

const voiceCommandResponseSchema = z.object({
  command: z.enum(["전진", "후진", "좌회전", "우회전"]),
  saved: z.boolean(),
});

export type VoiceCommandResponse = z.infer<typeof voiceCommandResponseSchema>;

const apiErrorSchema = z.object({
  code: z.string(),
  message: z.string(),
  reply: z.string().trim().min(1).max(500).optional(),
  emotion: z.enum(["행복", "슬픔", "보통", "화남"]).nullable().optional(),
  confidence: z.number().min(0).max(1).optional(),
  complete: z.boolean().optional(),
  saved: z.boolean().optional(),
  command: z.enum(["전진", "후진", "좌회전", "우회전"]).optional(),
});

export class ApiError extends Error {
  readonly code: string;
  readonly response?: EmotionTurnResponse;
  readonly voiceResponse?: VoiceCommandResponse;

  constructor(
    code: string,
    message: string,
    response?: EmotionTurnResponse,
    voiceResponse?: VoiceCommandResponse,
  ) {
    super(message);
    this.name = "ApiError";
    this.code = code;
    this.response = response;
    this.voiceResponse = voiceResponse;
  }
}

function parseVoiceSaveFailure(value: z.infer<typeof apiErrorSchema>): VoiceCommandResponse | undefined {
  const parsed = voiceCommandResponseSchema.safeParse(value);
  return parsed.success ? parsed.data : undefined;
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

export async function postEmotionSave(emotion: Emotion): Promise<EmotionSaveResponse> {
  if (typeof navigator !== "undefined" && !navigator.onLine) {
    throw new ApiError("OFFLINE", "인터넷 연결을 확인한 뒤 다시 시도해 주세요.");
  }

  let response: Response;
  try {
    response = await fetch("/.netlify/functions/emotion-save", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ emotion }),
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
      throw new ApiError(parsedError.data.code, parsedError.data.message);
    }
    throw new ApiError("REQUEST_FAILED", "요청을 처리하지 못했어요. 다시 시도해 주세요.");
  }

  const parsed = emotionSaveResponseSchema.safeParse(body);
  if (!parsed.success || parsed.data.emotion !== emotion) {
    throw new ApiError("INVALID_RESPONSE", "서버 응답을 확인하지 못했어요. 다시 시도해 주세요.");
  }
  return parsed.data;
}

export async function postVoiceCommand(
  request: VoiceCommandRequest,
): Promise<VoiceCommandResponse> {
  if (typeof navigator !== "undefined" && !navigator.onLine) {
    throw new ApiError("OFFLINE", "인터넷 연결을 확인한 뒤 다시 시도해 주세요.");
  }

  let response: Response;
  try {
    response = await fetch("/.netlify/functions/voice-command", {
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
        undefined,
        parseVoiceSaveFailure(parsedError.data),
      );
    }
    throw new ApiError("REQUEST_FAILED", "요청을 처리하지 못했어요. 다시 시도해 주세요.");
  }

  const parsed = voiceCommandResponseSchema.safeParse(body);
  if (!parsed.success || !parsed.data.saved) {
    throw new ApiError("INVALID_RESPONSE", "서버 응답을 확인하지 못했어요. 다시 시도해 주세요.");
  }
  return parsed.data;
}

export type { EmotionTurnRequest, VoiceCommandRequest };
