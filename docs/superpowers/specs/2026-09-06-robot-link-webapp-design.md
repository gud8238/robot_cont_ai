# Robot Link Web App Design

## 1. Purpose and scope

Build one responsive web application that lets a user choose between an emotion-recognition robot and a voice-command robot. The primary environment is a touch-enabled Chrome kiosk on tablets and laptops. The same application remains usable at smaller widths so a later mobile-focused redesign does not require an architectural rewrite.

The application connects one frontend to two independent Google Sheets through two Google Apps Script web APIs and uses one Gemini API integration. It stores only the final emotion or movement command in the corresponding sheet.

## 2. Approved architecture

Use a React, TypeScript, and Vite frontend hosted on Netlify. The browser calls same-origin Netlify Functions. Those functions are the security boundary for the Gemini API key, GAS deployment URLs, and GAS authentication tokens.

Two separate GAS web applications are deployed with `clasp`:

- Emotion GAS writes only to `시트1!A2` in spreadsheet `1zkaiqCPlOu_3sg2FZEavDRZt1R88G-aVuiefS7puj0g`.
- Voice-command GAS writes only to `음성명령 지게차!A2` in spreadsheet `1-Kfl3N5dInSFagkL8GaCzyBGHmuUgO2NwQtfx2jDA1M`.

Each spreadsheet has one visible tab. Both A2 target cells were verified as empty during design discovery. Existing A1 values are out of scope and must not be overwritten.

The frontend never receives the Gemini key, GAS authentication tokens, or GAS deployment URLs. Local secrets live in `.env.local`; production secrets live in Netlify environment variables and GAS Script Properties. The existing user-supplied Gemini key will be used, but its plaintext must never be committed, logged, copied into source, placed in a `VITE_` variable, or included in build output.

## 3. Data flow

### 3.1 Emotion flow

1. The user chooses the emotion-recognition robot.
2. The app displays “오늘의 기분에 대해 함께 알아봅시다” and asks for name, age, and preferred form of address.
3. Chrome Web Speech recognition converts speech to text. No raw audio file is uploaded or stored.
4. The frontend holds the current conversation in memory and sends the profile and bounded conversation history to the `emotion-turn` Netlify Function.
5. The function calls `gemini-3.6-flash` and requires a structured response containing an empathetic reply, optional emotion, confidence, and completion state.
6. After at least three user utterances, Gemini may complete when confidence is sufficient. If no result is complete after six user utterances, the best matching allowed emotion is selected.
7. When complete, the function sends only the final allowed emotion and a request ID to the emotion GAS endpoint.
8. GAS validates the token, request ID, and allowlist, then writes the value to `시트1!A2` under a script lock.
9. The browser speaks the AI reply with Chrome speech synthesis and shows the matching generated emotion illustration.

Allowed emotion values are exactly `행복`, `슬픔`, `보통`, and `화남`.

### 3.2 Voice-command flow

1. The user chooses the voice-command robot.
2. The app displays “음성명령을 내려주세요” and an instruction panel explaining the four supported commands.
3. For speech input, Chrome Web Speech recognition produces a transcript and sends it to the `voice-command` Netlify Function.
4. Gemini classifies the transcript into one allowed movement command. Ambiguous or unsupported requests do not write to the sheet.
5. For touch input, the selected allowed command bypasses Gemini and goes directly through server-side validation.
6. The function sends the validated command and request ID to the voice-command GAS endpoint.
7. GAS writes the value to `음성명령 지게차!A2` under a script lock.

Allowed command values are exactly `전진`, `후진`, `좌회전`, and `우회전`.

## 4. API contracts

### 4.1 Emotion turn

Request:

```ts
type EmotionTurnRequest = {
  profile: {
    name: string;
    age: number;
    honorific: string;
  };
  history: Array<{
    role: "user" | "assistant";
    text: string;
  }>;
};
```

Response:

```ts
type EmotionTurnResponse = {
  reply: string;
  emotion: "행복" | "슬픔" | "보통" | "화남" | null;
  confidence: number;
  complete: boolean;
  saved: boolean;
};
```

### 4.2 Voice command

Request:

```ts
type VoiceCommandRequest =
  | { source: "speech"; transcript: string }
  | {
      source: "touch";
      command: "전진" | "후진" | "좌회전" | "우회전";
    };
```

Response:

```ts
type VoiceCommandResponse = {
  command: "전진" | "후진" | "좌회전" | "우회전";
  saved: boolean;
};
```

All endpoints reject unsupported HTTP methods, malformed JSON, oversized text, invalid profile fields, unknown enum values, and structurally invalid Gemini output.

## 5. GAS behavior

Each GAS project implements:

- `doGet` returning public health metadata without secrets.
- `doPost` parsing JSON and validating a shared authentication token stored in Script Properties.
- A strict value allowlist specific to that GAS project.
- A request-ID check using Script Properties to make retries idempotent.
- `LockService` around the request-ID check and A2 write.
- Explicit spreadsheet ID, tab name, and `A2` target; no active-sheet or implicit-range behavior.
- JSON success and error responses with no sensitive diagnostic values.

## 6. Speech and conversation behavior

Chrome is the supported kiosk browser. The app uses `SpeechRecognition`/`webkitSpeechRecognition` for Korean speech-to-text and `speechSynthesis` for Korean text-to-speech. It shows the recognized text and AI reply so the flow remains understandable without sound.

If microphone access or Web Speech is unavailable, emotion mode provides a text input fallback and command mode keeps the touch direction controls available.

The emotion prompt is empathetic and child-friendly, asks only one question at a time, avoids diagnosis, and treats the result as a simple description of the current mood. If the conversation contains language indicating immediate danger, the response prioritizes asking a trusted adult, guardian, or teacher for help instead of presenting the interaction as a clinical assessment.

## 7. Visual design

The design adapts the supplied Dribbble reference without copying its artwork, logo, or layout pixel-for-pixel.

### 7.1 Visual system

- Ice-blue canvas: `#EAF8FB`
- Deep teal text and controls: `#073E4A`
- Aqua interactive accent: `#24C7D1`
- Coral emotion accent: `#FF7D7A`
- Lavender secondary emotion accent: `#A99CF5`
- Translucent white cards with large rounded corners and soft cyan shadows
- Friendly Korean display type for headings and a highly legible Korean sans-serif for body and controls

The signature element is a central 3D robot surrounded by an orbit that divides into warm emotion colors on the left and aqua command colors on the right.

### 7.2 Generated raster assets

The approved ImageGen scope is:

- One friendly 3D robot hero visual for the mode-selection screen.
- Four emotion-result illustrations: happy, sad, neutral, and angry.

Buttons, direction icons, microphone controls, waveforms, dividers, and other UI ornaments remain HTML, CSS, or SVG.

### 7.3 Screens

- Mode selector: central robot with large emotion and command cards.
- Emotion onboarding: message plus name, age, and preferred-address fields.
- Emotion conversation: large microphone, live listening state, transcript, AI response, and text fallback.
- Emotion result: generated illustration, one-word emotion, save status, retry, and return-home actions.
- Command introduction: four-command explanation.
- Command controller: large microphone plus a touch direction pad with forward, backward, left-turn, and right-turn controls.

### 7.4 Responsive behavior

- At 1200 px and above, use a wide kiosk composition with the robot between the two mode cards.
- From 768 to 1199 px, place the robot above two side-by-side mode cards.
- Below 768 px, stack content into one column without removing functionality.
- Touch targets are at least 64 px for primary robot controls.
- Keyboard focus, sufficient contrast, reduced-motion preferences, and non-audio status text are supported.

## 8. State and errors

The frontend models explicit states for idle, requesting microphone permission, listening, recognizing, generating, saving, success, recoverable error, and unsupported browser behavior. It prevents duplicate submissions while a request is active.

User-facing recovery messages include:

- Microphone denied: explain how to enable the Chrome address-bar microphone permission.
- No speech recognized: invite the user to retry or use text/touch input.
- Unsupported command: repeat the four supported commands without writing a value.
- Gemini error: retry once server-side, then return a safe recoverable error.
- GAS save error: retain the result on screen and expose a “다시 전송” action.
- Offline: do not submit; explain that the connection must recover before retrying.

Conversation text, profile fields, and raw request bodies must not be written to application logs. Only the final enum value is persisted to a spreadsheet.

## 9. Test and release gates

Local validation must complete before any GAS, GitHub, or Netlify deployment action:

1. Vitest unit tests for allowlists, validation, Gemini response parsing, state transitions, and GAS request construction.
2. React Testing Library coverage for onboarding, conversation, result, direction controls, fallback input, errors, and retries.
3. GAS unit tests with service stubs for authentication, allowlists, request IDs, locking, and exact A2 writes.
4. Mocked integration tests for both complete user journeys without modifying live sheets.
5. Playwright Chromium tests at 1440×900, 1024×768, 768×1024, and a small-screen viewport.
6. Accessibility checks for keyboard navigation, labels, focus, contrast, and reduced motion.
7. Visual inspection of generated assets and rendered responsive layouts.
8. Secret scanning of source, Git history, and production build output.
9. A final `lint`, `typecheck`, unit/integration, E2E, and production-build run.

After the local gate passes, deployment occurs once in this order:

1. Deploy both GAS projects with `clasp`.
2. Configure GAS Script Properties without printing or committing secret values.
3. Configure Netlify server-only environment variables with the CLI.
4. Commit and push the implementation to GitHub `main`.
5. Deploy the production site with the Netlify CLI.
6. Run a Chrome production smoke test for speech, touch, and both data paths.
7. Verify the exact A2 value in both sheets.

No deployment occurs during intermediate implementation or inspection cycles.

## 10. Out of scope

- Persistent conversation history or user accounts
- Additional emotions or robot commands
- Clinical mental-health diagnosis
- Native mobile applications
- Browsers other than Chrome as a guaranteed speech target
- Writing anywhere in either spreadsheet except the resolved A2 target cell
