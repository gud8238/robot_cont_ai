import { act, cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { VoiceFlow } from "./VoiceFlow";

type ResultHandler = ((event: {
  results: ArrayLike<{ isFinal: boolean; 0: { transcript: string } }>;
}) => void) | null;

class FakeSpeechRecognition {
  static instance: FakeSpeechRecognition;

  lang = "";
  interimResults = false;
  continuous = true;
  onresult: ResultHandler = null;
  onerror = null;
  onend = null;
  start = vi.fn();
  abort = vi.fn();

  constructor() {
    FakeSpeechRecognition.instance = this;
  }

  emitResult(transcript: string) {
    this.onresult?.({ results: [{ 0: { transcript }, isFinal: true }] });
  }
}

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function requestBodies() {
  return vi.mocked(fetch).mock.calls.map(([, init]) => JSON.parse(String(init?.body)) as unknown);
}

async function openController() {
  const user = userEvent.setup();
  await user.click(screen.getByRole("button", { name: "안내 확인" }));
  return user;
}

beforeEach(() => {
  vi.stubGlobal("fetch", vi.fn());
  vi.stubGlobal("SpeechRecognition", FakeSpeechRecognition);
  vi.stubGlobal("webkitSpeechRecognition", undefined);
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("VoiceFlow", () => {
  it("shows the four-command instruction panel on fresh entry", () => {
    render(<VoiceFlow onExit={vi.fn()} />);

    expect(screen.getByRole("heading", { name: "음성명령을 내려주세요" })).toHaveFocus();
    expect(screen.getByText("전진")).toBeVisible();
    expect(screen.getByText("후진")).toBeVisible();
    expect(screen.getByText("좌회전")).toBeVisible();
    expect(screen.getByText("우회전")).toBeVisible();
    expect(screen.queryByRole("group", { name: "로봇 방향 명령" })).not.toBeInTheDocument();
  });

  it.each(["전진", "후진", "좌회전", "우회전"] as const)(
    "sends the exact touch command %s",
    async (command) => {
      vi.mocked(fetch).mockResolvedValue(jsonResponse({ command, saved: true }));
      render(<VoiceFlow onExit={vi.fn()} />);
      const user = await openController();

      await user.click(screen.getByRole("button", { name: command }));

      expect(await screen.findByText(`${command} 명령을 전달했어요.`)).toBeVisible();
      expect(fetch).toHaveBeenCalledTimes(1);
      expect(requestBodies()).toEqual([{ source: "touch", command }]);
    },
  );

  it("sends a recognized transcript through speech classification", async () => {
    vi.mocked(fetch).mockResolvedValue(jsonResponse({ command: "좌회전", saved: true }));
    render(<VoiceFlow onExit={vi.fn()} />);
    const user = await openController();

    await user.click(screen.getByRole("button", { name: "음성으로 말하기" }));
    expect(screen.getByRole("status")).toHaveAttribute("aria-live", "polite");
    expect(screen.getByRole("status")).toHaveTextContent("말씀을 듣고 있어요");
    act(() => FakeSpeechRecognition.instance.emitResult("왼쪽으로 돌아 줘"));

    expect(await screen.findByText("좌회전 명령을 전달했어요.")).toBeVisible();
    expect(screen.getByText(/왼쪽으로 돌아 줘/)).toBeVisible();
    expect(requestBodies()).toEqual([{ source: "speech", transcript: "왼쪽으로 돌아 줘" }]);
  });

  it("shows the supported-command hint without claiming success for ambiguous speech", async () => {
    vi.mocked(fetch).mockResolvedValue(jsonResponse({
      code: "UNSUPPORTED_COMMAND",
      message: "전진, 후진, 좌회전, 우회전 중 하나로 다시 말해 주세요.",
    }, 422));
    render(<VoiceFlow onExit={vi.fn()} />);
    const user = await openController();

    await user.click(screen.getByRole("button", { name: "음성으로 말하기" }));
    act(() => FakeSpeechRecognition.instance.emitResult("불을 켜 줘"));

    expect(await screen.findByText(/전진, 후진, 좌회전, 우회전 중 하나/)).toBeVisible();
    expect(screen.queryByText(/명령을 전달했어요/)).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "다시 시도" })).not.toBeInTheDocument();
  });

  it("disables command controls only while a server request is active", async () => {
    let finishRequest: ((response: Response) => void) | undefined;
    vi.mocked(fetch).mockImplementation(() => new Promise((resolve) => {
      finishRequest = resolve;
    }));
    render(<VoiceFlow onExit={vi.fn()} />);
    const user = await openController();

    await user.click(screen.getByRole("button", { name: "음성으로 말하기" }));
    expect(screen.getByRole("button", { name: "전진" })).toBeEnabled();
    act(() => FakeSpeechRecognition.instance.emitResult("앞으로 가"));

    await waitFor(() => expect(fetch).toHaveBeenCalledTimes(1));
    expect(screen.getByRole("status")).toHaveTextContent("명령을 보내고 있어요");
    expect(screen.getByRole("button", { name: "전진" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "음성으로 말하기" })).toBeDisabled();

    finishRequest?.(jsonResponse({ command: "전진", saved: true }));
    expect(await screen.findByText("전진 명령을 전달했어요.")).toBeVisible();
    expect(screen.getByRole("button", { name: "전진" })).toBeEnabled();
  });

  it("offers one-request-per-click retry after a network error", async () => {
    vi.mocked(fetch)
      .mockRejectedValueOnce(new TypeError("network unavailable"))
      .mockResolvedValueOnce(jsonResponse({ command: "후진", saved: true }));
    render(<VoiceFlow onExit={vi.fn()} />);
    const user = await openController();

    await user.click(screen.getByRole("button", { name: "후진" }));
    expect(await screen.findByText(/네트워크 연결을 확인/)).toBeVisible();
    expect(fetch).toHaveBeenCalledTimes(1);

    await user.click(screen.getByRole("button", { name: "다시 시도" }));
    expect(await screen.findByText("후진 명령을 전달했어요.")).toBeVisible();
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(requestBodies()).toEqual([
      { source: "touch", command: "후진" },
      { source: "touch", command: "후진" },
    ]);
  });

  it("retries a failed speech-command save without classifying the transcript again", async () => {
    vi.mocked(fetch)
      .mockResolvedValueOnce(jsonResponse({
        code: "SAVE_FAILED",
        message: "로봇 명령을 저장하지 못했어요. 잠시 후 다시 전송해 주세요.",
        command: "우회전",
        saved: false,
      }, 502))
      .mockResolvedValueOnce(jsonResponse({ command: "우회전", saved: true }));
    render(<VoiceFlow onExit={vi.fn()} />);
    const user = await openController();

    await user.click(screen.getByRole("button", { name: "음성으로 말하기" }));
    act(() => FakeSpeechRecognition.instance.emitResult("오른쪽으로 돌아 줘"));
    expect(await screen.findByText(/저장하지 못했어요/)).toBeVisible();

    await user.click(screen.getByRole("button", { name: "다시 전송" }));
    expect(await screen.findByText("우회전 명령을 전달했어요.")).toBeVisible();
    expect(requestBodies()).toEqual([
      { source: "speech", transcript: "오른쪽으로 돌아 줘" },
      { source: "touch", command: "우회전" },
    ]);
  });

  it("cancels listening and exits home", async () => {
    const onExit = vi.fn();
    render(<VoiceFlow onExit={onExit} />);
    const user = await openController();
    await user.click(screen.getByRole("button", { name: "음성으로 말하기" }));

    await user.click(screen.getByRole("button", { name: /처음으로/ }));

    expect(FakeSpeechRecognition.instance.abort).toHaveBeenCalledOnce();
    expect(onExit).toHaveBeenCalledOnce();
  });
});
