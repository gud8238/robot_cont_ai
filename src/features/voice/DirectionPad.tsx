import type { Command } from "../../../netlify/functions/_shared/contracts";

type DirectionPadProps = {
  readonly disabled: boolean;
  readonly onCommand: (command: Command) => void;
};

const directions = [
  { command: "전진", className: "forward", path: "M12 19V5m0 0-5 5m5-5 5 5" },
  { command: "좌회전", className: "left", path: "M19 12H5m0 0 5-5m-5 5 5 5" },
  { command: "우회전", className: "right", path: "M5 12h14m0 0-5-5m5 5-5 5" },
  { command: "후진", className: "backward", path: "M12 5v14m0 0 5-5m-5 5-5-5" },
] as const;

export function DirectionPad({ disabled, onCommand }: DirectionPadProps) {
  return (
    <div className="direction-pad" role="group" aria-label="로봇 방향 명령">
      {directions.map(({ command, className, path }) => (
        <button
          className={`direction-button direction-button--${className}`}
          type="button"
          disabled={disabled}
          onClick={() => onCommand(command)}
          key={command}
        >
          <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.25" strokeLinecap="round" strokeLinejoin="round">
            <path d={path} />
          </svg>
          <span>{command}</span>
        </button>
      ))}
    </div>
  );
}
