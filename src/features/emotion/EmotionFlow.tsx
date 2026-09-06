import { useEffect, useRef, useState, type FormEvent } from "react";
import { SpeechButton } from "../../components/SpeechButton";
import { StatusBadge } from "../../components/StatusBadge";
import type { Emotion } from "../../../netlify/functions/_shared/contracts";
import { useEmotionSession } from "./useEmotionSession";

const emotionAssets = {
  행복: "/assets/emotions/happy.webp",
  슬픔: "/assets/emotions/sad.webp",
  보통: "/assets/emotions/neutral.webp",
  화남: "/assets/emotions/angry.webp",
} as const;

const emotionImageLabels: Record<Emotion, string> = {
  행복: "행복한 표정의 로봇",
  슬픔: "슬픈 표정의 로봇",
  보통: "차분한 표정의 로봇",
  화남: "화난 표정의 로봇",
};

type EmotionFlowProps = {
  readonly onExit: () => void;
};

function phaseStatus(phase: ReturnType<typeof useEmotionSession>["phase"]) {
  if (phase === "listening") return "말씀을 듣고 있어요";
  if (phase === "thinking") return "마음을 헤아리고 있어요";
  if (phase === "speaking") return "로봇이 이야기하고 있어요";
  if (phase === "saving-error") return "결과 전송을 기다리고 있어요";
  return "이야기할 준비가 됐어요";
}

export function EmotionFlow({ onExit }: EmotionFlowProps) {
  const session = useEmotionSession();
  const [draft, setDraft] = useState("");
  const headingRef = useRef<HTMLHeadingElement>(null);

  useEffect(() => {
    if (["profile", "ready", "saving-error", "result"].includes(session.phase)) {
      headingRef.current?.focus();
    }
  }, [session.phase]);

  function exit() {
    session.cancel();
    onExit();
  }

  function submitProfile(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    session.startProfile({
      name: String(data.get("name") ?? "").trim(),
      age: Number(data.get("age")),
      honorific: String(data.get("honorific") ?? "").trim(),
    });
  }

  async function submitDraft(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const text = draft;
    if (!text.trim()) {
      return;
    }
    setDraft("");
    await session.submitText(text);
  }

  if (session.phase === "profile") {
    return (
      <section className="emotion-flow emotion-flow--profile">
        <button className="home-button" type="button" onClick={exit}>
          <span aria-hidden="true">← </span>처음으로
        </button>
        <div className="emotion-flow__intro">
          <p className="emotion-flow__eyebrow">마음을 나누는 대화</p>
          <h1 ref={headingRef} tabIndex={-1}>오늘의 기분에 대해 함께 알아봅시다</h1>
          <p>편하게 이야기할 수 있도록 먼저 어떻게 불러드리면 좋을지 알려주세요.</p>
        </div>
        <form className="profile-form" onSubmit={submitProfile}>
          <label>
            <span>이름</span>
            <input name="name" type="text" autoComplete="name" required minLength={1} maxLength={30} />
          </label>
          <label>
            <span>나이</span>
            <input name="age" type="number" inputMode="numeric" required min={4} max={120} />
          </label>
          <label>
            <span>불러줬으면 하는 이름</span>
            <input name="honorific" type="text" required minLength={1} maxLength={30} placeholder="예: 민준아, 지우님" />
          </label>
          <button className="primary-button" type="submit">대화 시작</button>
        </form>
      </section>
    );
  }

  if ((session.phase === "result" || session.phase === "saving-error") && session.result?.emotion) {
    const emotion = session.result.emotion;
    return (
      <section className="emotion-flow emotion-result">
        <button className="home-button" type="button" onClick={exit}>
          <span aria-hidden="true">← </span>처음으로
        </button>
        <div className="emotion-result__card">
          <img
            src={emotionAssets[emotion]}
            alt={emotionImageLabels[emotion]}
            width="1024"
            height="1024"
          />
          <div className="emotion-result__copy">
            <p className="emotion-flow__eyebrow">지금 마음과 가장 가까운 기분</p>
            <h1 ref={headingRef} tabIndex={-1}>{emotion}</h1>
            <p className="emotion-result__reply">{session.result.reply}</p>
            {session.phase === "result" && session.result.saved ? (
              <StatusBadge tone="success">감정 결과를 시트에 전달했어요.</StatusBadge>
            ) : (
              <>
                <StatusBadge tone="error">아직 시트에 전달하지 못했어요.</StatusBadge>
                <p className="emotion-flow__error" role="alert">{session.message}</p>
                <button className="primary-button" type="button" onClick={() => void session.retrySave()} disabled={session.busy}>
                  다시 전송
                </button>
              </>
            )}
          </div>
        </div>
      </section>
    );
  }

  return (
    <section className="emotion-flow emotion-conversation">
      <div className="emotion-flow__toolbar">
        <button className="home-button" type="button" onClick={exit}>
          <span aria-hidden="true">← </span>처음으로
        </button>
        <button className="mute-button" type="button" onClick={session.toggleMuted} aria-label={session.muted ? "음성 안내 켜기" : "음성 안내 끄기"}>
          <span aria-hidden="true">{session.muted ? "🔇" : "🔊"}</span>
          음성 안내 {session.muted ? "꺼짐" : "켜짐"}
        </button>
      </div>
      <header className="emotion-conversation__header">
        <p className="emotion-flow__eyebrow">{session.profile?.honorific}, 오늘 이야기를 들려주세요</p>
        <h1 ref={headingRef} tabIndex={-1}>어떤 일이 있었나요?</h1>
        <StatusBadge tone={session.busy ? "busy" : "neutral"}>{phaseStatus(session.phase)}</StatusBadge>
      </header>

      {session.history.length > 0 ? (
        <ol className="conversation-history" aria-label="대화 내용" aria-live="polite">
          {session.history.map((item, index) => (
            <li className={`conversation-history__item conversation-history__item--${item.role}`} key={`${item.role}-${index}`}>
              <span>{item.role === "user" ? "나" : "로봇"}</span>
              <p>{item.text}</p>
            </li>
          ))}
        </ol>
      ) : (
        <p className="conversation-empty">좋았던 일, 속상했던 일, 평범했던 일 모두 좋아요.</p>
      )}

      {session.message ? <p className="emotion-flow__error" role="alert">{session.message}</p> : null}

      <div className="conversation-controls">
        <SpeechButton
          listening={session.phase === "listening"}
          disabled={session.busy && session.phase !== "listening"}
          supported={session.speechSupported}
          onStart={() => void session.startListening()}
          onCancel={session.cancelListening}
        />
        <form className="fallback-form" onSubmit={submitDraft}>
          <label htmlFor="emotion-fallback">직접 입력</label>
          <textarea
            id="emotion-fallback"
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            placeholder="여기에 오늘 있었던 일을 적어주세요."
            maxLength={800}
            rows={3}
            disabled={session.busy}
          />
          <button className="primary-button" type="submit" disabled={session.busy || !draft.trim()}>
            보내기
          </button>
        </form>
      </div>
    </section>
  );
}
