import { useState } from "react";
import { ModeCard } from "../components/ModeCard";
import { StatusBadge } from "../components/StatusBadge";
import { EmotionFlow } from "../features/emotion/EmotionFlow";
import { VoiceFlow } from "../features/voice/VoiceFlow";
import "../styles/global.css";

export type Mode = "home" | "emotion" | "voice";

const modes = [
  {
    variant: "emotion",
    title: "감정인식로봇",
    eyebrow: "마음을 나누는 대화",
    description: "오늘 있었던 일을 들려주세요. 로봇과 이야기하며 지금의 기분을 알아봐요.",
    examples: ["행복", "슬픔", "보통", "화남"],
  },
  {
    variant: "voice",
    title: "음성명령로봇",
    eyebrow: "내 말에 따라 움직이는 로봇",
    description: "원하는 방향을 말하거나 눌러주세요. 네 가지 명령으로 로봇을 움직여요.",
    examples: ["전진", "후진", "좌회전", "우회전"],
  },
] as const;

function focusButton(node: HTMLButtonElement | null) {
  node?.focus();
}

export function App() {
  const [{ mode, lastMode }, setNavigation] = useState<{
    mode: Mode;
    lastMode: Exclude<Mode, "home"> | null;
  }>({ mode: "home", lastMode: null });

  function openMode(nextMode: Exclude<Mode, "home">) {
    setNavigation({ mode: nextMode, lastMode: nextMode });
  }

  return (
    <div className="app-shell">
      <header className="app-header">
        <div className="brand">
          <span className="brand__mark" aria-hidden="true">
            <svg viewBox="0 0 32 32" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
              <rect x="5" y="9" width="22" height="17" rx="7" />
              <path d="M16 9V5M11 16v2m10-2v2m-8 4h6" />
            </svg>
          </span>
          <span>Robot <strong>Link</strong></span>
        </div>
        <span className="header-note">
          <span className="header-note__dot" aria-hidden="true" />
          감정과 명령을 하나로
        </span>
      </header>

      {mode === "home" ? (
        <main>
          <div className="home-intro">
            <p className="home-intro__eyebrow"><span aria-hidden="true">✦</span> 오늘의 로봇 파트너</p>
            <h1>로봇 모드를 선택하세요</h1>
            <p className="home-intro__description">어떤 방식으로 오늘 하루를 시작할까요?<br />로봇과 함께하는 특별한 경험이 기다리고 있어요.</p>
          </div>
          <div className="mode-selector">
            <figure className="robot-hero" style={{ overflow: "hidden" }}>
              <div className="robot-hero__orbit robot-hero__orbit--warm" aria-hidden="true" />
              <div className="robot-hero__orbit robot-hero__orbit--cool" aria-hidden="true" />
              <span className="robot-hero__spark robot-hero__spark--one" aria-hidden="true" />
              <span className="robot-hero__spark robot-hero__spark--two" aria-hidden="true" />
              <img className="robot-hero__image" src="/assets/hero/robot-link-v2.webp" alt="웃으며 손을 흔드는 하얀 로봇 친구" width="1024" height="1536" fetchPriority="high" decoding="async" />
              <figcaption><strong>Robot Link</strong><span>언제나, 너와 함께</span></figcaption>
            </figure>
            {modes.map((item) => (
              <ModeCard key={item.variant} {...item} onStart={() => openMode(item.variant)} buttonRef={lastMode === item.variant ? focusButton : undefined} />
            ))}
          </div>
          <footer className="home-footer">
            <StatusBadge>연결 준비 완료</StatusBadge>
            <p>마음을 듣고, 세상을 움직이는 로봇과 연결해 보세요.</p>
          </footer>
        </main>
      ) : mode === "emotion" ? (
        <main>
          <EmotionFlow onExit={() => setNavigation({ mode: "home", lastMode })} />
        </main>
      ) : (
        <main>
          <VoiceFlow onExit={() => setNavigation({ mode: "home", lastMode })} />
        </main>
      )}
    </div>
  );
}
