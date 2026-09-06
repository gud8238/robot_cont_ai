import { useState } from "react";
import { ModeCard } from "../components/ModeCard";
import { StatusBadge } from "../components/StatusBadge";
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

function focusHeading(node: HTMLHeadingElement | null) {
  node?.focus();
}

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
          로봇이랑
        </div>
        <span className="header-note">마음을 나누고, 움직임을 만드는 시간</span>
      </header>

      {mode === "home" ? (
        <main>
          <div className="home-intro">
            <p className="home-intro__eyebrow">반가워요, 함께 시작해 볼까요?</p>
            <h1>오늘은 어떤 로봇과 <span>함께할까요?</span></h1>
            <p className="home-intro__description">마음을 이야기해도, 움직임을 알려줘도 좋아요.</p>
          </div>
          <div className="mode-selector">
              <figure className="robot-hero" style={{ overflow: "hidden" }}>
              <div className="robot-hero__orbit robot-hero__orbit--warm" aria-hidden="true" />
              <div className="robot-hero__orbit robot-hero__orbit--cool" aria-hidden="true" />
              <img className="robot-hero__image" src="/assets/hero/robot-link.webp" alt="웃으며 두 팔을 펼친 하얀 로봇 친구" width="1254" height="1254" fetchPriority="high" decoding="async" />
              <figcaption>어떤 이야기도 들을 준비가 됐어요</figcaption>
            </figure>
            {modes.map((item) => (
              <ModeCard key={item.variant} {...item} onStart={() => openMode(item.variant)} buttonRef={lastMode === item.variant ? focusButton : undefined} />
            ))}
          </div>
          <footer className="home-footer">
            <StatusBadge>두 가지 로봇 체험</StatusBadge>
            <p>화면의 큰 버튼을 눌러 시작해 주세요.</p>
          </footer>
        </main>
      ) : (
        <main className="mode-placeholder">
          <button className="home-button" type="button" onClick={() => setNavigation({ mode: "home", lastMode })}><span aria-hidden="true">← </span>처음으로</button>
          <h1 ref={focusHeading} tabIndex={-1}>{mode === "emotion" ? "오늘의 기분에 대해 함께 알아봅시다" : "음성명령을 내려주세요"}</h1>
          <p>{mode === "emotion" ? "로봇과 마음을 나누는 대화 화면을 준비하고 있어요." : "로봇에게 방향을 알려주는 명령 화면을 준비하고 있어요."}</p>
        </main>
      )}
    </div>
  );
}
