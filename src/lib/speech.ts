export type SpeechErrorCode =
  | "UNSUPPORTED_SPEECH"
  | "PERMISSION_DENIED"
  | "NO_SPEECH"
  | "AUDIO_CAPTURE"
  | "SPEECH_ERROR"
  | "CANCELLED";

export class SpeechAdapterError extends Error {
  readonly code: SpeechErrorCode;

  constructor(code: SpeechErrorCode) {
    super(code);
    this.name = "SpeechAdapterError";
    this.code = code;
  }
}

type RecognitionResult = {
  readonly isFinal: boolean;
  readonly 0: { readonly transcript: string };
};

type RecognitionResultEvent = {
  readonly results: ArrayLike<RecognitionResult>;
};

type RecognitionErrorEvent = {
  readonly error: string;
};

export type SpeechRecognitionLike = {
  lang: string;
  interimResults: boolean;
  continuous: boolean;
  onresult: ((event: RecognitionResultEvent) => void) | null;
  onerror: ((event: RecognitionErrorEvent) => void) | null;
  onend: (() => void) | null;
  start(): void;
  abort(): void;
};

export type SpeechRecognitionConstructor = new () => SpeechRecognitionLike;

type SpeechWindow = Window & {
  SpeechRecognition?: SpeechRecognitionConstructor;
  webkitSpeechRecognition?: SpeechRecognitionConstructor;
};

function browserRecognition(): SpeechRecognitionConstructor | null {
  if (typeof window === "undefined") {
    return null;
  }

  const speechWindow = window as SpeechWindow;
  return speechWindow.SpeechRecognition ?? speechWindow.webkitSpeechRecognition ?? null;
}

function mapRecognitionError(error: string): SpeechErrorCode {
  if (error === "not-allowed" || error === "service-not-allowed") {
    return "PERMISSION_DENIED";
  }
  if (error === "no-speech") {
    return "NO_SPEECH";
  }
  if (error === "audio-capture") {
    return "AUDIO_CAPTURE";
  }
  return "SPEECH_ERROR";
}

export function createSpeechAdapter(
  Recognition: SpeechRecognitionConstructor | null = browserRecognition(),
) {
  let active:
    | {
        recognition: SpeechRecognitionLike;
        reject: (error: SpeechAdapterError) => void;
      }
    | undefined;

  function clearHandlers(recognition: SpeechRecognitionLike) {
    recognition.onresult = null;
    recognition.onerror = null;
    recognition.onend = null;
  }

  function cancel() {
    if (!active) {
      return;
    }

    const current = active;
    active = undefined;
    clearHandlers(current.recognition);
    current.recognition.abort();
    current.reject(new SpeechAdapterError("CANCELLED"));
  }

  function listen(): Promise<string> {
    if (!Recognition) {
      return Promise.reject(new SpeechAdapterError("UNSUPPORTED_SPEECH"));
    }

    cancel();

    return new Promise((resolve, reject) => {
      const recognition = new Recognition();
      recognition.lang = "ko-KR";
      recognition.interimResults = true;
      recognition.continuous = false;

      const finish = (result: string | SpeechAdapterError) => {
        if (active?.recognition !== recognition) {
          return;
        }
        active = undefined;
        clearHandlers(recognition);
        if (typeof result === "string") {
          resolve(result);
        } else {
          reject(result);
        }
      };

      recognition.onresult = (event) => {
        for (let index = event.results.length - 1; index >= 0; index -= 1) {
          const result = event.results[index];
          const transcript = result?.[0]?.transcript.trim();
          if (result?.isFinal && transcript) {
            finish(transcript);
            return;
          }
        }
      };
      recognition.onerror = (event) => {
        finish(new SpeechAdapterError(mapRecognitionError(event.error)));
      };
      recognition.onend = () => {
        finish(new SpeechAdapterError("NO_SPEECH"));
      };

      active = { recognition, reject };
      try {
        recognition.start();
      } catch {
        finish(new SpeechAdapterError("SPEECH_ERROR"));
      }
    });
  }

  return {
    supported: Recognition !== null,
    listen,
    cancel,
  } as const;
}

type SpeechVoiceLike = {
  readonly lang: string;
};

type SpeechUtteranceLike = {
  lang: string;
  voice: SpeechVoiceLike | null;
  onend: (() => void) | null;
  onerror: (() => void) | null;
};

type SpeechSynthesisLike = {
  getVoices(): SpeechVoiceLike[];
  speak(utterance: SpeechUtteranceLike): void;
  cancel(): void;
};

type SpeakKoreanOptions = {
  readonly muted?: boolean;
  readonly synthesis?: SpeechSynthesisLike;
  readonly createUtterance?: (text: string) => SpeechUtteranceLike;
};

export type SpeechPlayback = {
  readonly finished: Promise<void>;
  cancel(): void;
};

export function speakKorean(text: string, options: SpeakKoreanOptions = {}): SpeechPlayback {
  const synthesis = options.synthesis ?? (
    typeof window === "undefined"
      ? undefined
      : window.speechSynthesis as unknown as SpeechSynthesisLike | undefined
  );
  const createUtterance = options.createUtterance ?? (
    typeof SpeechSynthesisUtterance === "undefined"
      ? undefined
      : (value: string) => new SpeechSynthesisUtterance(value) as unknown as SpeechUtteranceLike
  );

  if (options.muted || !synthesis || !createUtterance || !text.trim()) {
    return { finished: Promise.resolve(), cancel() {} };
  }

  const utterance = createUtterance(text);
  utterance.lang = "ko-KR";
  utterance.voice = synthesis.getVoices().find((voice) => voice.lang.toLowerCase().startsWith("ko")) ?? null;

  let settled = false;
  let finish!: () => void;
  const finished = new Promise<void>((resolve) => {
    finish = () => {
      if (settled) {
        return;
      }
      settled = true;
      utterance.onend = null;
      utterance.onerror = null;
      resolve();
    };
  });

  utterance.onend = finish;
  utterance.onerror = finish;
  synthesis.speak(utterance);

  return {
    finished,
    cancel() {
      if (!settled) {
        synthesis.cancel();
        finish();
      }
    },
  };
}
