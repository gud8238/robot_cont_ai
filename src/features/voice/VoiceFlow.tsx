import { useCallback, useEffect, useRef, useState } from "react";
import type { Command, VoiceCommandRequest } from "../../../netlify/functions/_shared/contracts";
import { SpeechButton } from "../../components/SpeechButton";
import { ApiError, postVoiceCommand } from "../../lib/api";
import { createSpeechAdapter, SpeechAdapterError } from "../../lib/speech";
import { DirectionPad } from "./DirectionPad";

type VoiceFlowProps = {
  readonly onExit: () => void;
};

type VoicePhase = "intro" | "ready" | "listening" | "sending" | "success" | "error";

type RetryState = {
  readonly request: VoiceCommandRequest;
  readonly label: "다시 시도" | "다시 전송";
};

const SPEECH_MESSAGES = {
  UNSUPPORTED_SPEECH: "이 브라우저는 음성 입력을 지원하지 않아요. 방향 버튼을 눌러 명령해 주세요.",
  PERMISSION_DENIED: "Chrome 주소창의 마이크 권한을 허용한 뒤 다시 눌러 주세요.",
  NO_SPEECH: "말소리를 듣지 못했어요. 다시 말하거나 방향 버튼을 눌러 주세요.",
  AUDIO_CAPTURE: "마이크를 찾지 못했어요. 연결을 확인하거나 방향 버튼을 눌러 주세요.",
  SPEECH_ERROR: "음성을 알아듣지 못했어요. 다시 말하거나 방향 버튼을 눌러 주세요.",
  CANCELLED: "명령을 선택하거나 마이크를 눌러 말해 주세요.",
} as const;

const READY_MESSAGE = "명령을 선택하거나 마이크를 눌러 말해 주세요.";

export function VoiceFlow({ onExit }: VoiceFlowProps) {
  const [adapter] = useState(() => createSpeechAdapter());
  const [phase, setPhase] = useState<VoicePhase>("intro");
  const [message, setMessage] = useState(READY_MESSAGE);
  const [requestActive, setRequestActive] = useState(false);
  const [lastTranscript, setLastTranscript] = useState("");
  const [retry, setRetry] = useState<RetryState | null>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const activeRef = useRef(false);
  const mountedRef = useRef(true);
  const listeningRef = useRef(false);
  const listenIdRef = useRef(0);

  useEffect(() => {
    mountedRef.current = true;
    headingRef.current?.focus();
    return () => {
      mountedRef.current = false;
      listeningRef.current = false;
      listenIdRef.current += 1;
      adapter.cancel();
    };
  }, [adapter]);

  useEffect(() => {
    if (phase === "intro" || phase === "ready") {
      headingRef.current?.focus();
    }
  }, [phase]);

  const stopListening = useCallback((announce = true) => {
    if (!listeningRef.current) {
      return;
    }
    listeningRef.current = false;
    listenIdRef.current += 1;
    adapter.cancel();
    if (announce) {
      setPhase("ready");
      setMessage(READY_MESSAGE);
    }
  }, [adapter]);

  const sendRequest = useCallback(async (
    request: VoiceCommandRequest,
    keepRetry = false,
  ) => {
    if (activeRef.current) {
      return;
    }
    stopListening(false);
    activeRef.current = true;
    setRequestActive(true);
    if (!keepRetry) {
      setRetry(null);
    }
    setPhase("sending");
    setMessage("명령을 보내고 있어요");

    try {
      const response = await postVoiceCommand(request);
      if (!mountedRef.current) {
        return;
      }
      setRetry(null);
      setPhase("success");
      setMessage(`${response.command} 명령을 전달했어요.`);
    } catch (error) {
      if (!mountedRef.current) {
        return;
      }
      const apiError = error instanceof ApiError ? error : null;
      setPhase("error");
      setMessage(apiError?.message ?? "요청을 처리하지 못했어요. 다시 시도해 주세요.");

      if (apiError?.code === "UNSUPPORTED_COMMAND") {
        setRetry(null);
      } else if (apiError?.code === "SAVE_FAILED" && apiError.voiceResponse) {
        setRetry({
          request: { source: "touch", command: apiError.voiceResponse.command },
          label: "다시 전송",
        });
      } else {
        setRetry({ request, label: "다시 시도" });
      }
    } finally {
      activeRef.current = false;
      if (mountedRef.current) {
        setRequestActive(false);
      }
    }
  }, [stopListening]);

  const startListening = useCallback(async () => {
    if (activeRef.current) {
      return;
    }
    const listenId = listenIdRef.current + 1;
    listenIdRef.current = listenId;
    listeningRef.current = true;
    setRetry(null);
    setPhase("listening");
    setMessage("말씀을 듣고 있어요");

    try {
      const transcript = await adapter.listen();
      if (!mountedRef.current || listenIdRef.current !== listenId) {
        return;
      }
      listeningRef.current = false;
      setLastTranscript(transcript);
      await sendRequest({ source: "speech", transcript });
    } catch (error) {
      if (!mountedRef.current || listenIdRef.current !== listenId) {
        return;
      }
      listeningRef.current = false;
      const code = error instanceof SpeechAdapterError ? error.code : "SPEECH_ERROR";
      setPhase("error");
      setMessage(SPEECH_MESSAGES[code]);
    }
  }, [adapter, sendRequest]);

  function exit() {
    stopListening(false);
    onExit();
  }

  if (phase === "intro") {
    return (
      <section className="voice-flow voice-intro">
        <button className="home-button" type="button" onClick={exit}>
          <span aria-hidden="true">← </span>처음으로
        </button>
        <div className="voice-intro__card">
          <p className="voice-flow__eyebrow">내 말에 따라 움직이는 로봇</p>
          <h1 ref={headingRef} tabIndex={-1}>음성명령을 내려주세요</h1>
          <p className="voice-intro__description">말하거나 화면을 눌러 로봇을 움직일 수 있어요. 사용할 수 있는 명령은 네 가지예요.</p>
          <ul className="voice-command-list" aria-label="사용할 수 있는 음성 명령">
            <li><strong>전진</strong><span>앞으로 이동</span></li>
            <li><strong>후진</strong><span>뒤로 이동</span></li>
            <li><strong>좌회전</strong><span>왼쪽으로 회전</span></li>
            <li><strong>우회전</strong><span>오른쪽으로 회전</span></li>
          </ul>
          <p className="voice-intro__notice">그 밖의 말은 로봇 명령으로 전달되지 않아요.</p>
          <button
            className="primary-button voice-intro__start"
            type="button"
            onClick={() => {
              setPhase("ready");
              setMessage(adapter.supported ? READY_MESSAGE : SPEECH_MESSAGES.UNSUPPORTED_SPEECH);
            }}
          >
            안내 확인
          </button>
        </div>
      </section>
    );
  }

  return (
    <section className="voice-flow voice-controller-screen">
      <button className="home-button" type="button" onClick={exit}>
        <span aria-hidden="true">← </span>처음으로
      </button>
      <header className="voice-controller__header">
        <p className="voice-flow__eyebrow">방향을 말하거나 눌러주세요</p>
        <h1 ref={headingRef} tabIndex={-1}>로봇을 어디로 움직일까요?</h1>
        <span className="status-badge">
          <span className="status-badge__dot" aria-hidden="true" />
          준비된 명령 4개
        </span>
      </header>

      <div className="voice-controller">
        <DirectionPad
          disabled={requestActive}
          onCommand={(command: Command) => void sendRequest({ source: "touch", command })}
        />
        <div className="voice-controller__microphone">
          <SpeechButton
            listening={phase === "listening"}
            disabled={requestActive}
            supported={adapter.supported}
            onStart={() => void startListening()}
            onCancel={() => stopListening()}
          />
        </div>
      </div>

      <div className="voice-feedback">
        {lastTranscript ? <p className="voice-feedback__transcript">들은 말: <q>{lastTranscript}</q></p> : null}
        <p className={`voice-feedback__status voice-feedback__status--${phase}`} role="status" aria-live="polite" aria-atomic="true">
          {message}
        </p>
        {retry ? (
          <button
            className="primary-button"
            type="button"
            disabled={requestActive}
            onClick={() => void sendRequest(retry.request, true)}
          >
            {retry.label}
          </button>
        ) : null}
      </div>
    </section>
  );
}
