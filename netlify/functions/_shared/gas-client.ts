import type { Command, Emotion } from "./contracts";

export type GasClientErrorCode =
  | "HTTP_ERROR"
  | "INVALID_RESPONSE"
  | "REQUEST_FAILED"
  | "TIMEOUT";

export class GasClientError extends Error {
  readonly code: GasClientErrorCode;

  constructor(code: GasClientErrorCode) {
    super("Google Sheets writer request failed");
    this.name = "GasClientError";
    this.code = code;
  }
}

export type GasFetch = (
  input: string | URL | Request,
  init?: RequestInit
) => Promise<Response>;

export type GasClientConfig = {
  readonly emotionUrl: string;
  readonly emotionToken: string;
  readonly voiceUrl: string;
  readonly voiceToken: string;
};

function isTimeout(error: unknown): boolean {
  return error instanceof DOMException
    && (error.name === "TimeoutError" || error.name === "AbortError");
}

async function postValue(
  fetchImpl: GasFetch,
  url: string,
  token: string,
  value: Emotion | Command,
  requestId: string
): Promise<void> {
  let response: Response;
  try {
    response = await fetchImpl(url, {
      method: "POST",
      redirect: "follow",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token, requestId, value }),
      signal: AbortSignal.timeout(8000)
    });
  } catch (error) {
    throw new GasClientError(isTimeout(error) ? "TIMEOUT" : "REQUEST_FAILED");
  }

  if (!response.ok) {
    throw new GasClientError("HTTP_ERROR");
  }

  let body: unknown;
  try {
    body = await response.json();
  } catch {
    throw new GasClientError("INVALID_RESPONSE");
  }

  if (
    typeof body !== "object"
    || body === null
    || Array.isArray(body)
    || !("ok" in body)
    || body.ok !== true
  ) {
    throw new GasClientError("INVALID_RESPONSE");
  }
}

export function createGasClient(config: GasClientConfig, fetchImpl: GasFetch = fetch) {
  return {
    saveEmotion(value: Emotion, requestId: string): Promise<void> {
      return postValue(fetchImpl, config.emotionUrl, config.emotionToken, value, requestId);
    },

    saveCommand(value: Command, requestId: string): Promise<void> {
      return postValue(fetchImpl, config.voiceUrl, config.voiceToken, value, requestId);
    }
  };
}
