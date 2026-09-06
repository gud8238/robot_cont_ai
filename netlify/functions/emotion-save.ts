import type { Handler, HandlerEvent } from "@netlify/functions";
import {
  emotionSaveRequestSchema,
  type Emotion,
  type EmotionSaveRequest,
} from "./_shared/contracts";
import { readServerEnv } from "./_shared/env";
import { createGasClient } from "./_shared/gas-client";
import { parseJsonBody } from "./_shared/http";

type FunctionResponse = {
  readonly statusCode: number;
  readonly headers: Record<string, string>;
  readonly body: string;
};

type EmotionSaveHandlerDependencies = {
  readonly saveEmotion: (emotion: Emotion, requestId: string) => Promise<void>;
  readonly createRequestId: () => string;
};

const ERROR_MESSAGES = {
  METHOD_NOT_ALLOWED: "POST 요청만 사용할 수 있어요.",
  INVALID_REQUEST: "저장할 감정 결과를 확인해 주세요.",
  SAVE_FAILED: "감정 결과를 저장하지 못했어요. 잠시 후 다시 전송해 주세요.",
  SERVICE_UNAVAILABLE: "서비스를 준비하지 못했어요. 잠시 후 다시 시도해 주세요.",
} as const;

function jsonResponse(statusCode: number, body: Record<string, unknown>): FunctionResponse {
  return {
    statusCode,
    headers: { "Content-Type": "application/json; charset=utf-8" },
    body: JSON.stringify(body),
  };
}

function errorResponse(
  statusCode: number,
  code: keyof typeof ERROR_MESSAGES,
  details: Record<string, unknown> = {},
): FunctionResponse {
  return jsonResponse(statusCode, { code, message: ERROR_MESSAGES[code], ...details });
}

function hasJsonContentType(event: HandlerEvent): boolean {
  const contentType = Object.entries(event.headers).find(
    ([name]) => name.toLowerCase() === "content-type",
  )?.[1];
  return contentType?.split(";", 1)[0].trim().toLowerCase() === "application/json";
}

async function parseEmotionSaveRequest(event: HandlerEvent): Promise<EmotionSaveRequest | null> {
  if (!hasJsonContentType(event)) {
    return null;
  }
  try {
    const body = await parseJsonBody(new Request("https://function.internal", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: event.body ?? "",
    }));
    const parsed = emotionSaveRequestSchema.safeParse(body);
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

export function createEmotionSaveHandler(dependencies: EmotionSaveHandlerDependencies) {
  return async (event: HandlerEvent): Promise<FunctionResponse> => {
    if (event.httpMethod !== "POST") {
      return errorResponse(405, "METHOD_NOT_ALLOWED");
    }
    const request = await parseEmotionSaveRequest(event);
    if (!request) {
      return errorResponse(400, "INVALID_REQUEST");
    }
    try {
      await dependencies.saveEmotion(request.emotion, dependencies.createRequestId());
      return jsonResponse(200, { emotion: request.emotion, saved: true });
    } catch {
      return errorResponse(502, "SAVE_FAILED", { emotion: request.emotion, saved: false });
    }
  };
}

function createProductionHandler() {
  const environment = readServerEnv();
  const gas = createGasClient({
    emotionUrl: environment.EMOTION_GAS_URL,
    emotionToken: environment.EMOTION_GAS_TOKEN,
    voiceUrl: environment.VOICE_GAS_URL,
    voiceToken: environment.VOICE_GAS_TOKEN,
  });
  return createEmotionSaveHandler({
    saveEmotion: gas.saveEmotion,
    createRequestId: () => crypto.randomUUID(),
  });
}

let productionHandler: ReturnType<typeof createProductionHandler> | undefined;

export const handler: Handler = async (event) => {
  try {
    productionHandler ??= createProductionHandler();
    return await productionHandler(event);
  } catch {
    return errorResponse(502, "SERVICE_UNAVAILABLE");
  }
};
