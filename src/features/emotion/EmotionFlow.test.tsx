import { act, cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { StrictMode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { EmotionFlow } from "./EmotionFlow";

const completedResponse = {
  reply: "행복한 하루였군요.",
  emotion: "행복",
  confidence: 0.94,
  complete: true,
  saved: true,
};

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

async function fillProfileAndSubmit() {
  const user = userEvent.setup();
  await user.type(screen.getByRole("textbox", { name: "이름" }), "민준");
  await user.type(screen.getByRole("spinbutton", { name: "나이" }), "10");
  await user.type(screen.getByRole("textbox", { name: "불러줬으면 하는 이름" }), "민준아");
  await user.click(screen.getByRole("button", { name: "대화 시작" }));
  return user;
}

async function submitFallbackText(text: string) {
  const user = userEvent.setup();
  await user.type(screen.getByRole("textbox", { name: "직접 입력" }), text);
  await user.click(screen.getByRole("button", { name: "보내기" }));
}

type SpeechErrorHandler = ((event: { error: string }) => void) | null;

class PermissionDeniedRecognition {
  static instance: PermissionDeniedRecognition;

  lang = "";
  interimResults = false;
  continuous = true;
  onresult = null;
  onerror: SpeechErrorHandler = null;
  onend = null;
  abort = vi.fn();
  start = vi.fn();

  constructor() {
    PermissionDeniedRecognition.instance = this;
  }

  deny() {
    this.onerror?.({ error: "not-allowed" });
  }
}

beforeEach(() => {
  vi.stubGlobal("fetch", vi.fn());
  vi.stubGlobal("SpeechRecognition", undefined);
  vi.stubGlobal("webkitSpeechRecognition", undefined);
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("EmotionFlow", () => {
  it("collects profile data and reveals the saved emotion result", async () => {
    vi.mocked(fetch).mockResolvedValue(jsonResponse(completedResponse));
    render(<EmotionFlow onExit={vi.fn()} />);
    await fillProfileAndSubmit();

    await submitFallbackText("친구와 놀아서 즐거웠어요");

    expect(await screen.findByRole("heading", { name: "행복" })).toBeVisible();
    expect(screen.getByRole("heading", { name: "행복" })).toHaveFocus();
    expect(screen.getByText("행복한 하루였군요.")).toBeVisible();
    expect(screen.getByText(/시트에 전달했어요/)).toBeVisible();
    expect(screen.getByRole("img", { name: "행복한 표정의 로봇" })).toHaveAttribute(
      "src",
      "/assets/emotions/happy.webp",
    );
    expect(vi.mocked(fetch)).toHaveBeenCalledWith(
      "/.netlify/functions/emotion-turn",
      expect.objectContaining({ method: "POST" }),
    );
  });

  it("reaches the result when React StrictMode replays effect setup", async () => {
    vi.mocked(fetch).mockResolvedValue(jsonResponse(completedResponse));
    render(
      <StrictMode>
        <EmotionFlow onExit={vi.fn()} />
      </StrictMode>,
    );
    await fillProfileAndSubmit();

    await submitFallbackText("친구와 놀아서 즐거웠어요");

    expect(await screen.findByRole("heading", { name: "행복" })).toBeVisible();
    expect(screen.getByText(/시트에 전달했어요/)).toBeVisible();
  });

  it.each([
    {
      label: "공백 이름",
      values: { name: "   ", age: "10", honorific: "민준아" },
      message: "이름을 입력해 주세요.",
      field: "이름",
    },
    {
      label: "잘못된 나이",
      values: { name: "민준", age: "3", honorific: "민준아" },
      message: "나이는 4세부터 120세까지 입력해 주세요.",
      field: "나이",
    },
    {
      label: "공백 호칭",
      values: { name: "민준", age: "10", honorific: "   " },
      message: "불러줬으면 하는 이름을 입력해 주세요.",
      field: "불러줬으면 하는 이름",
    },
  ])("$label 프로필을 거부하고 첫 오류 필드에 초점을 둔다", async ({ values, message, field }) => {
    const user = userEvent.setup();
    render(<EmotionFlow onExit={vi.fn()} />);
    await user.type(screen.getByRole("textbox", { name: "이름" }), values.name);
    await user.type(screen.getByRole("spinbutton", { name: "나이" }), values.age);
    await user.type(screen.getByRole("textbox", { name: "불러줬으면 하는 이름" }), values.honorific);

    await user.click(screen.getByRole("button", { name: "대화 시작" }));

    expect(screen.getByRole("alert")).toHaveTextContent(message);
    expect(screen.getByRole(field === "나이" ? "spinbutton" : "textbox", { name: field })).toHaveFocus();
    expect(screen.getByRole("heading", { name: /오늘의 기분/ })).toBeVisible();
  });

  it("keeps typed input available when speech is unsupported", async () => {
    vi.mocked(fetch).mockResolvedValue(jsonResponse({
      reply: "조금 더 이야기해 줄래요?",
      emotion: null,
      confidence: 0.4,
      complete: false,
      saved: false,
    }));
    render(<EmotionFlow onExit={vi.fn()} />);
    await fillProfileAndSubmit();

    expect(screen.getByText(/음성 입력을 지원하지 않아요/)).toBeVisible();
    expect(screen.getByRole("textbox", { name: "직접 입력" })).toBeEnabled();
    await submitFallbackText("오늘은 조금 심심했어요");

    expect(await screen.findByText("조금 더 이야기해 줄래요?")).toBeVisible();
    expect(screen.getByRole("textbox", { name: "직접 입력" })).toBeEnabled();
  });

  it("explains microphone permission recovery and preserves typed fallback", async () => {
    vi.stubGlobal("SpeechRecognition", PermissionDeniedRecognition);
    render(<EmotionFlow onExit={vi.fn()} />);
    const user = await fillProfileAndSubmit();

    await user.click(screen.getByRole("button", { name: "음성으로 말하기" }));
    act(() => PermissionDeniedRecognition.instance.deny());

    expect(await screen.findByText(/주소창.*마이크 권한/)).toBeVisible();
    expect(screen.getByRole("textbox", { name: "직접 입력" })).toBeEnabled();
  });

  it("disables duplicate submissions while a turn is active", async () => {
    let finishRequest: ((response: Response) => void) | undefined;
    vi.mocked(fetch).mockImplementation(() => new Promise((resolve) => {
      finishRequest = resolve;
    }));
    render(<EmotionFlow onExit={vi.fn()} />);
    await fillProfileAndSubmit();

    const user = userEvent.setup();
    await user.type(screen.getByRole("textbox", { name: "직접 입력" }), "기분이 좋아요");
    await user.click(screen.getByRole("button", { name: "보내기" }));

    expect(screen.getByRole("button", { name: "보내기" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "음성으로 말하기" })).toBeDisabled();
    expect(fetch).toHaveBeenCalledTimes(1);

    finishRequest?.(jsonResponse(completedResponse));
    expect(await screen.findByRole("heading", { name: "행복" })).toBeVisible();
  });

  it("retains a completed result and retries a failed save", async () => {
    let finishRetry: ((response: Response) => void) | undefined;
    vi.mocked(fetch)
      .mockResolvedValueOnce(jsonResponse({
        ...completedResponse,
        saved: false,
        code: "SAVE_FAILED",
        message: "감정 결과를 저장하지 못했어요. 잠시 후 다시 전송해 주세요.",
      }, 502))
      .mockImplementationOnce(() => new Promise((resolve) => {
        finishRetry = resolve;
      }));
    render(<EmotionFlow onExit={vi.fn()} />);
    await fillProfileAndSubmit();
    await submitFallbackText("친구와 놀아서 즐거웠어요");

    expect(await screen.findByRole("heading", { name: "행복" })).toBeVisible();
    expect(screen.getByText(/아직 시트에 전달하지 못했어요/)).toBeVisible();
    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: "다시 전송" }));

    expect(screen.getByRole("heading", { name: "행복" })).toBeVisible();
    expect(screen.getByRole("button", { name: "다시 전송" })).toBeDisabled();
    finishRetry?.(jsonResponse({ emotion: "행복", saved: true }));
    expect(await screen.findByText(/시트에 전달했어요/)).toBeVisible();
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(vi.mocked(fetch).mock.calls.map(([url]) => url)).toEqual([
      "/.netlify/functions/emotion-turn",
      "/.netlify/functions/emotion-save",
    ]);
    expect(JSON.parse(String((vi.mocked(fetch).mock.calls[1]?.[1] as RequestInit).body))).toEqual({
      emotion: "행복",
    });
  });

  it("cancels active speech synthesis when mute is turned on", async () => {
    const synthesis = {
      getVoices: vi.fn(() => [{ lang: "ko-KR" }]),
      speak: vi.fn(),
      cancel: vi.fn(),
    };
    class FakeUtterance {
      lang = "";
      voice = null;
      onend: (() => void) | null = null;
      onerror: (() => void) | null = null;
    }
    vi.stubGlobal("speechSynthesis", synthesis);
    vi.stubGlobal("SpeechSynthesisUtterance", FakeUtterance);
    vi.mocked(fetch).mockResolvedValue(jsonResponse(completedResponse));
    render(<EmotionFlow onExit={vi.fn()} />);
    await fillProfileAndSubmit();
    await submitFallbackText("기분이 좋아요");
    expect(await screen.findByText("행복한 하루였군요.")).toBeVisible();

    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: "음성 안내 끄기" }));

    expect(synthesis.cancel).toHaveBeenCalledOnce();
    expect(await screen.findByRole("heading", { name: "행복" })).toBeVisible();
  });

  it("cancels recognition before exiting and returns home", async () => {
    vi.stubGlobal("SpeechRecognition", PermissionDeniedRecognition);
    const onExit = vi.fn();
    render(<EmotionFlow onExit={onExit} />);
    const user = await fillProfileAndSubmit();
    await user.click(screen.getByRole("button", { name: "음성으로 말하기" }));

    await user.click(screen.getByRole("button", { name: "처음으로" }));

    expect(PermissionDeniedRecognition.instance.abort).toHaveBeenCalledOnce();
    expect(onExit).toHaveBeenCalledOnce();
  });

  it("bounds request history to the latest twelve entries", async () => {
    const responses = Array.from({ length: 7 }, (_, index) => jsonResponse({
      reply: `${index + 1}번째 답변이에요.`,
      emotion: null,
      confidence: 0.4,
      complete: false,
      saved: false,
    }));
    vi.mocked(fetch).mockImplementation(() => Promise.resolve(responses.shift() ?? jsonResponse(completedResponse)));
    render(<EmotionFlow onExit={vi.fn()} />);
    await fillProfileAndSubmit();

    for (let index = 0; index < 7; index += 1) {
      await submitFallbackText(`${index + 1}번째 이야기예요.`);
      await screen.findByText(`${index + 1}번째 답변이에요.`);
    }

    const lastCall = vi.mocked(fetch).mock.calls.at(-1);
    const request = JSON.parse(String((lastCall?.[1] as RequestInit).body)) as { history: unknown[] };
    expect(request.history).toHaveLength(12);
    await waitFor(() => expect(screen.getByRole("textbox", { name: "직접 입력" })).toBeEnabled());
  });
});
