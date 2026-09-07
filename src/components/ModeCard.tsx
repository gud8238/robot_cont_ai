import type { Ref } from "react";

type ModeCardProps = {
  variant: "emotion" | "voice";
  title: string;
  eyebrow: string;
  description: string;
  examples: readonly string[];
  onStart: () => void;
  buttonRef?: Ref<HTMLButtonElement>;
};

export function ModeCard({ variant, title, eyebrow, description, examples, onStart, buttonRef }: ModeCardProps) {
  return (
    <section className={`mode-card mode-card--${variant}`} aria-labelledby={`${variant}-title`}>
      <div className="mode-card__icon" aria-hidden="true">
        <svg viewBox="0 0 48 48" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
          {variant === "emotion" ? (
            <path d="M24 39 8 24C-2 13 13 1 24 14 35 1 50 13 40 24Z" />
          ) : (
            <>
              <rect x="18" y="5" width="12" height="24" rx="6" />
              <path d="M11 22a13 13 0 0 0 26 0M24 35v8m-7 0h14" />
            </>
          )}
        </svg>
      </div>
      <p className="mode-card__eyebrow">{eyebrow}</p>
      <h2 id={`${variant}-title`}>{title}</h2>
      <p className="mode-card__description">{description}</p>
      <ul className="mode-card__examples" aria-label={variant === "emotion" ? "알아볼 수 있는 기분" : "사용할 수 있는 명령"}>
        {examples.map((example) => <li key={example}>{example}</li>)}
      </ul>
      <button ref={buttonRef} className="mode-card__start" type="button" onClick={onStart} aria-label={`${title} 시작`}>
        시작하기 <span aria-hidden="true">→</span>
      </button>
    </section>
  );
}
