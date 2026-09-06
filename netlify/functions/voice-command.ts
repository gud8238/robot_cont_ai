import type { Handler, HandlerEvent } from "@netlify/functions";
import {
  voiceCommandRequestSchema,
  voiceCommandResultSchema,
  type Command
} from "./_shared/contracts";
import { readServerEnv } from "./_shared/env";
import { createGasClient } from "./_shared/gas-client";
import { createGeminiGateway, GeminiGatewayError } from "./_shared/gemini";
import { parseJsonBody } from "./_shared/http";

type FunctionResponse = {
  readonly statusCode: number;
  readonly headers: Record<string, string>;
  readonly body: string;
};

type VoiceHandlerDependencies = {
  readonly classifyCommand: (transcript: string) => Promise<unknown>;
  readonly saveCommand: (command: Command, requestId: string) => Promise<void>;
  readonly createRequestId: () => string;
};

const ERROR_MESSAGES = {
  METHOD_NOT_ALLOWED: "POST 요청만 사용할 수 있어요.",
  INVALID_REQUEST: "요청 내용을 확인한 뒤 다시 시도해 주세요.",
  UNSUPPORTED_COMMAND: "전진, 후진, 좌회전, 우회전 중 하나로 다시 말해 주세요.",
  GEMINI_ERROR: "음성 명령을 처리하지 못했어요. 잠시 후 다시 시도해 주세요.",
  SAVE_FAILED: "로봇 명령을 저장하지 못했어요. 잠시 후 다시 전송해 주세요.",
  SERVICE_UNAVAILABLE: "서비스를 준비하지 못했어요. 잠시 후 다시 시도해 주세요."
} as const;

function jsonResponse(statusCode: number, body: Record<string, unknown>): FunctionResponse {
  return {
    statusCode,
    headers: { "Content-Type": "application/json; charset=utf-8" },
    body: JSON.stringify(body)
  };
}

function errorResponse(
  statusCode: number,
  code: keyof typeof ERROR_MESSAGES,
  details: Record<string, unknown> = {}
): FunctionResponse {
  return jsonResponse(statusCode, {
    ...details,
    code,
    message: ERROR_MESSAGES[code]
  });
}

function hasJsonContentType(event: HandlerEvent): boolean {
  const contentType = Object.entries(event.headers).find(
    ([name]) => name.toLowerCase() === "content-type"
  )?.[1];
  return contentType?.split(";", 1)[0].trim().toLowerCase() === "application/json";
}

async function parseVoiceRequest(event: HandlerEvent) {
  if (!hasJsonContentType(event)) {
    return null;
  }

  try {
    const body = await parseJsonBody(new Request("https://function.internal", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: event.body ?? ""
    }));
    const parsed = voiceCommandRequestSchema.safeParse(body);
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

function isUnsupportedCommand(error: unknown): boolean {
  return error instanceof GeminiGatewayError
    || (
      typeof error === "object"
      && error !== null
      && "code" in error
      && error.code === "UNSUPPORTED_COMMAND"
    );
}

export function createVoiceHandler(dependencies: VoiceHandlerDependencies) {
  return async (event: HandlerEvent): Promise<FunctionResponse> => {
    if (event.httpMethod !== "POST") {
      return errorResponse(405, "METHOD_NOT_ALLOWED");
    }

    const request = await parseVoiceRequest(event);
    if (!request) {
      return errorResponse(400, "INVALID_REQUEST");
    }

    let command: Command;
    if (request.source === "touch") {
      command = request.command;
    } else {
      let classified;
      try {
        classified = await dependencies.classifyCommand(request.transcript);
      } catch (error) {
        return isUnsupportedCommand(error)
          ? errorResponse(422, "UNSUPPORTED_COMMAND")
          : errorResponse(502, "GEMINI_ERROR");
      }

      const parsed = voiceCommandResultSchema.safeParse(classified);
      if (!parsed.success) {
        return errorResponse(502, "GEMINI_ERROR");
      }
      command = parsed.data.command;
    }

    try {
      await dependencies.saveCommand(command, dependencies.createRequestId());
    } catch {
      return errorResponse(502, "SAVE_FAILED", { command, saved: false });
    }

    return jsonResponse(200, { command, saved: true });
  };
}

function createProductionHandler() {
  const environment = readServerEnv();
  const gemini = createGeminiGateway(environment.GEMINI_API_KEY);
  const gas = createGasClient({
    emotionUrl: environment.EMOTION_GAS_URL,
    emotionToken: environment.EMOTION_GAS_TOKEN,
    voiceUrl: environment.VOICE_GAS_URL,
    voiceToken: environment.VOICE_GAS_TOKEN
  });

  return createVoiceHandler({
    classifyCommand: gemini.classifyCommand,
    saveCommand: gas.saveCommand,
    createRequestId: () => crypto.randomUUID()
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
