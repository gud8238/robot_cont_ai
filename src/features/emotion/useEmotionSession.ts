import { useCallback, useEffect, useRef, useState } from "react";
import {
  ApiError,
  postEmotionSave,
  postEmotionTurn,
  type EmotionTurnRequest,
  type EmotionTurnResponse,
} from "../../lib/api";
import {
  createSpeechAdapter,
  speakKorean,
  SpeechAdapterError,
  type SpeechPlayback,
} from "../../lib/speech";

export type EmotionPhase =
  | "profile"
  | "ready"
  | "listening"
  | "thinking"
  | "speaking"
  | "saving-error"
  | "result";

export type EmotionProfile = EmotionTurnRequest["profile"];
export type EmotionHistoryItem = EmotionTurnRequest["history"][number];

const SPEECH_MESSAGES = {
  UNSUPPORTED_SPEECH: "이 브라우저는 음성 입력을 지원하지 않아요. 아래에 직접 입력해 주세요.",
  PERMISSION_DENIED: "Chrome 주소창의 마이크 권한을 허용한 뒤 다시 눌러 주세요.",
  NO_SPEECH: "말소리를 듣지 못했어요. 다시 말하거나 아래에 직접 입력해 주세요.",
  AUDIO_CAPTURE: "마이크를 찾지 못했어요. 연결을 확인하거나 아래에 직접 입력해 주세요.",
  SPEECH_ERROR: "음성을 알아듣지 못했어요. 다시 말하거나 아래에 직접 입력해 주세요.",
  CANCELLED: "",
} as const;

function boundedHistory(history: EmotionHistoryItem[]): EmotionHistoryItem[] {
  return history.slice(-12);
}

export function useEmotionSession() {
  const [adapter] = useState(() => createSpeechAdapter());
  const [phase, setPhase] = useState<EmotionPhase>("profile");
  const [profile, setProfile] = useState<EmotionProfile | null>(null);
  const [history, setHistory] = useState<EmotionHistoryItem[]>([]);
  const [result, setResult] = useState<EmotionTurnResponse | null>(null);
  const [message, setMessage] = useState("");
  const [muted, setMuted] = useState(false);
  const [requestActive, setRequestActive] = useState(false);
  const activeRef = useRef(false);
  const mountedRef = useRef(true);
  const playbackRef = useRef<SpeechPlayback | null>(null);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      adapter.cancel();
      playbackRef.current?.cancel();
    };
  }, [adapter]);

  const finishResponse = useCallback(async (
    request: EmotionTurnRequest,
    response: EmotionTurnResponse,
  ) => {
    if (!mountedRef.current) {
      return;
    }

    setHistory(boundedHistory([
      ...request.history,
      { role: "assistant", text: response.reply },
    ]));
    setResult(response.complete ? response : null);
    setPhase("speaking");
    const playback = speakKorean(response.reply, { muted });
    playbackRef.current = playback;
    await playback.finished;
    playbackRef.current = null;

    if (!mountedRef.current) {
      return;
    }
    setPhase(response.complete ? (response.saved ? "result" : "saving-error") : "ready");
  }, [muted]);

  const requestTurn = useCallback(async (request: EmotionTurnRequest) => {
    if (activeRef.current) {
      return;
    }

    activeRef.current = true;
    setRequestActive(true);
    setMessage("");
    setPhase("thinking");
    try {
      const response = await postEmotionTurn(request);
      await finishResponse(request, response);
    } catch (error) {
      if (!mountedRef.current) {
        return;
      }
      if (error instanceof ApiError && error.code === "SAVE_FAILED" && error.response) {
        setHistory(boundedHistory([
          ...request.history,
          { role: "assistant", text: error.response.reply },
        ]));
        setResult(error.response);
        setMessage(error.message);
        setPhase("saving-error");
      } else {
        setMessage(error instanceof ApiError ? error.message : "요청을 처리하지 못했어요. 다시 시도해 주세요.");
        setPhase("ready");
      }
    } finally {
      activeRef.current = false;
      if (mountedRef.current) {
        setRequestActive(false);
      }
    }
  }, [finishResponse]);

  const submitText = useCallback(async (text: string) => {
    const trimmed = text.trim();
    if (!profile || !trimmed || activeRef.current) {
      return;
    }
    const nextHistory = boundedHistory([...history, { role: "user", text: trimmed }]);
    setHistory(nextHistory);
    await requestTurn({ profile, history: nextHistory });
  }, [history, profile, requestTurn]);

  const startListening = useCallback(async () => {
    if (activeRef.current) {
      return;
    }
    activeRef.current = true;
    setMessage("");
    setPhase("listening");
    try {
      const transcript = await adapter.listen();
      activeRef.current = false;
      await submitText(transcript);
    } catch (error) {
      activeRef.current = false;
      if (!mountedRef.current) {
        return;
      }
      const code = error instanceof SpeechAdapterError ? error.code : "SPEECH_ERROR";
      setMessage(SPEECH_MESSAGES[code]);
      setPhase("ready");
    }
  }, [adapter, submitText]);

  const cancelListening = useCallback(() => {
    adapter.cancel();
    activeRef.current = false;
    setMessage("");
    setPhase("ready");
  }, [adapter]);

  const startProfile = useCallback((nextProfile: EmotionProfile) => {
    setProfile(nextProfile);
    setMessage(adapter.supported ? "" : SPEECH_MESSAGES.UNSUPPORTED_SPEECH);
    setPhase("ready");
  }, [adapter.supported]);

  const retrySave = useCallback(async () => {
    const emotion = result?.emotion;
    if (!emotion || activeRef.current) {
      return;
    }
    activeRef.current = true;
    setRequestActive(true);
    setMessage("");
    try {
      await postEmotionSave(emotion);
      if (mountedRef.current) {
        setResult((current) => current ? { ...current, saved: true } : current);
        setPhase("result");
      }
    } catch (error) {
      if (mountedRef.current) {
        setMessage(error instanceof ApiError ? error.message : "감정 결과를 저장하지 못했어요. 다시 시도해 주세요.");
        setPhase("saving-error");
      }
    } finally {
      activeRef.current = false;
      if (mountedRef.current) {
        setRequestActive(false);
      }
    }
  }, [result?.emotion]);

  const cancel = useCallback(() => {
    adapter.cancel();
    playbackRef.current?.cancel();
    activeRef.current = false;
  }, [adapter]);

  const toggleMuted = useCallback(() => {
    if (!muted) {
      playbackRef.current?.cancel();
    }
    setMuted((value) => !value);
  }, [muted]);

  return {
    phase,
    profile,
    history,
    result,
    message,
    muted,
    speechSupported: adapter.supported,
    busy: requestActive || phase === "listening" || phase === "thinking" || phase === "speaking",
    startProfile,
    submitText,
    startListening,
    cancelListening,
    retrySave,
    toggleMuted,
    cancel,
  } as const;
}
