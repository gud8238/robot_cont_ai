type SpeechButtonProps = {
  readonly listening: boolean;
  readonly disabled: boolean;
  readonly supported: boolean;
  readonly onStart: () => void;
  readonly onCancel: () => void;
};

export function SpeechButton({
  listening,
  disabled,
  supported,
  onStart,
  onCancel,
}: SpeechButtonProps) {
  const label = listening ? "듣기 취소" : "음성으로 말하기";

  return (
    <button
      className={`speech-button${listening ? " speech-button--listening" : ""}`}
      type="button"
      aria-label={label}
      aria-pressed={listening}
      disabled={disabled || !supported}
      onClick={listening ? onCancel : onStart}
    >
      <span className="speech-button__icon" aria-hidden="true">
        <svg viewBox="0 0 48 48" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
          <rect x="17" y="6" width="14" height="25" rx="7" />
          <path d="M10 24a14 14 0 0 0 28 0M24 38v6m-8 0h16" />
        </svg>
      </span>
      <span>{label}</span>
    </button>
  );
}
