import { describe, expect, it, vi } from "vitest";
import { createSpeechAdapter, speakKorean } from "./speech";

type ResultHandler = ((event: {
  results: ArrayLike<{ isFinal: boolean; 0: { transcript: string } }>;
}) => void) | null;

type ErrorHandler = ((event: { error: string }) => void) | null;

class FakeSpeechRecognition {
  static instance: FakeSpeechRecognition;

  lang = "";
  interimResults = false;
  continuous = true;
  onresult: ResultHandler = null;
  onerror: ErrorHandler = null;
  onend: (() => void) | null = null;
  start = vi.fn();
  abort = vi.fn();

  constructor() {
    FakeSpeechRecognition.instance = this;
  }

  emitResult(transcript: string, isFinal = true) {
    this.onresult?.({ results: [{ 0: { transcript }, isFinal }] });
  }

  emitError(error: string) {
    this.onerror?.({ error });
  }
}

describe("speech adapter", () => {
  it("uses one-shot Korean recognition and returns the final transcript", async () => {
    const adapter = createSpeechAdapter(FakeSpeechRecognition);

    const listening = adapter.listen();
    FakeSpeechRecognition.instance.emitResult("친구와 놀아서 즐거웠어요");

    await expect(listening).resolves.toBe("친구와 놀아서 즐거웠어요");
    expect(FakeSpeechRecognition.instance.lang).toBe("ko-KR");
    expect(FakeSpeechRecognition.instance.interimResults).toBe(true);
    expect(FakeSpeechRecognition.instance.continuous).toBe(false);
    expect(FakeSpeechRecognition.instance.onresult).toBeNull();
    expect(FakeSpeechRecognition.instance.onerror).toBeNull();
    expect(FakeSpeechRecognition.instance.onend).toBeNull();
  });

  it.each([
    ["not-allowed", "PERMISSION_DENIED"],
    ["no-speech", "NO_SPEECH"],
    ["audio-capture", "AUDIO_CAPTURE"],
  ])("maps %s to the stable %s application code", async (browserCode, appCode) => {
    const adapter = createSpeechAdapter(FakeSpeechRecognition);

    const listening = adapter.listen();
    FakeSpeechRecognition.instance.emitError(browserCode);

    await expect(listening).rejects.toMatchObject({ code: appCode });
    expect(FakeSpeechRecognition.instance.onresult).toBeNull();
    expect(FakeSpeechRecognition.instance.onerror).toBeNull();
    expect(FakeSpeechRecognition.instance.onend).toBeNull();
  });

  it("reports unsupported speech without constructing recognition", async () => {
    const adapter = createSpeechAdapter(null);

    expect(adapter.supported).toBe(false);
    await expect(adapter.listen()).rejects.toMatchObject({ code: "UNSUPPORTED_SPEECH" });
  });

  it("aborts an active recognition and removes every handler", async () => {
    const adapter = createSpeechAdapter(FakeSpeechRecognition);
    const listening = adapter.listen();

    adapter.cancel();

    await expect(listening).rejects.toMatchObject({ code: "CANCELLED" });
    expect(FakeSpeechRecognition.instance.abort).toHaveBeenCalledOnce();
    expect(FakeSpeechRecognition.instance.onresult).toBeNull();
    expect(FakeSpeechRecognition.instance.onerror).toBeNull();
    expect(FakeSpeechRecognition.instance.onend).toBeNull();
  });
});

describe("Korean speech synthesis", () => {
  it("selects an available Korean voice", async () => {
    const koreanVoice = { lang: "ko-KR", name: "한국어" };
    const synthesis = {
      getVoices: vi.fn(() => [{ lang: "en-US", name: "English" }, koreanVoice]),
      speak: vi.fn((utterance: { onend: (() => void) | null }) => utterance.onend?.()),
      cancel: vi.fn(),
    };
    const utterance = { lang: "", voice: null as { lang: string; name: string } | null, onend: null as (() => void) | null, onerror: null as (() => void) | null };

    const playback = speakKorean("행복한 하루였군요.", {
      synthesis,
      createUtterance: () => utterance,
    });

    await playback.finished;
    expect(utterance.lang).toBe("ko-KR");
    expect(utterance.voice).toBe(koreanVoice);
    expect(synthesis.speak).toHaveBeenCalledWith(utterance);
  });

  it("does not speak while muted", async () => {
    const synthesis = { getVoices: vi.fn(() => []), speak: vi.fn(), cancel: vi.fn() };

    const playback = speakKorean("소리 내지 않아요.", {
      muted: true,
      synthesis,
      createUtterance: () => ({ lang: "", voice: null, onend: null, onerror: null }),
    });

    await playback.finished;
    expect(synthesis.speak).not.toHaveBeenCalled();
  });
});
