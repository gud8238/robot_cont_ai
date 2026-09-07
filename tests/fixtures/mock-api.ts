import type { Page } from "@playwright/test";

export type ApiCall = {
  readonly path: string;
  readonly body: unknown;
};

const emotionReplies = [
  { reply: "첫 번째 이야기를 들으니 즐거웠어요. 또 어떤 일이 기억나요?", emotion: null, confidence: 0.42, complete: false, saved: false },
  { reply: "친구와 함께한 시간이 소중했군요. 마지막으로 지금 마음은 어떤가요?", emotion: null, confidence: 0.67, complete: false, saved: false },
  { reply: "이야기를 들으니 지금 마음은 행복에 가까워 보여요.", emotion: "행복", confidence: 0.94, complete: true, saved: true },
] as const;

export async function installMockApi(page: Page): Promise<{ readonly calls: ApiCall[] }> {
  const calls: ApiCall[] = [];
  await page.route("**/.netlify/functions/**", async (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname;
    const body = request.postDataJSON() as unknown;
    calls.push({ path, body });
    if (request.method() !== "POST") {
      await route.fulfill({ status: 405, contentType: "application/json", body: JSON.stringify({ code: "METHOD_NOT_ALLOWED" }) });
      return;
    }
    if (path === "/.netlify/functions/emotion-turn") {
      const response = emotionReplies[calls.filter((call) => call.path === path).length - 1] ?? emotionReplies.at(-1)!;
      await route.fulfill({ contentType: "application/json", body: JSON.stringify(response) });
      return;
    }
    if (path === "/.netlify/functions/emotion-save") {
      await route.fulfill({ contentType: "application/json", body: JSON.stringify({ emotion: "행복", saved: true }) });
      return;
    }
    if (path === "/.netlify/functions/voice-command") {
      const command = typeof body === "object" && body !== null && "source" in body && body.source === "touch"
        ? (body as { command: string }).command
        : "전진";
      await route.fulfill({ contentType: "application/json", body: JSON.stringify({ command, saved: true }) });
      return;
    }
    await route.fulfill({ status: 404, contentType: "application/json", body: JSON.stringify({ code: "NOT_FOUND" }) });
  });
  return { calls };
}

export async function installDeterministicSpeech(page: Page, transcript = "앞으로 가") {
  await page.addInitScript((spokenText) => {
    class DeterministicRecognition {
      lang = "";
      interimResults = false;
      continuous = false;
      onresult: ((event: { results: ArrayLike<{ isFinal: boolean; 0: { transcript: string } }> }) => void) | null = null;
      onerror: ((event: { error: string }) => void) | null = null;
      onend: (() => void) | null = null;
      start() { queueMicrotask(() => this.onresult?.({ results: [{ isFinal: true, 0: { transcript: spokenText } }] })); }
      abort() {}
    }
    class DeterministicUtterance {
      lang = "";
      voice: { lang: string } | null = null;
      onend: (() => void) | null = null;
      onerror: (() => void) | null = null;
      constructor(text: string) { void text; }
    }
    Object.defineProperty(window, "SpeechRecognition", { configurable: true, value: DeterministicRecognition });
    Object.defineProperty(window, "SpeechSynthesisUtterance", { configurable: true, value: DeterministicUtterance });
    Object.defineProperty(window, "speechSynthesis", { configurable: true, value: {
      getVoices: () => [{ lang: "ko-KR" }],
      speak: (utterance: DeterministicUtterance) => queueMicrotask(() => utterance.onend?.()),
      cancel: () => undefined,
    } });
  }, transcript);
}
