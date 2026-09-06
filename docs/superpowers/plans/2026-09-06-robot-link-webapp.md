# Robot Link Web App Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deliver and deploy a responsive Chrome kiosk web app that runs an emotion-recognition conversation and a voice/touch robot controller, securely writes their final values to two separate Google Sheets through GAS, and keeps the Gemini API key server-side.

**Architecture:** A React 19 + TypeScript + Vite 8 client calls same-origin Netlify Functions. Netlify Functions call `gemini-3.6-flash` and two independently deployed, token-protected GAS web apps; the client never receives Gemini or GAS secrets. Chrome Web Speech supplies speech recognition and synthesis while all domain values are constrained by shared runtime schemas.

**Tech Stack:** Node 24, npm 11, React 19.2.8, Vite 8.2.2, TypeScript 7.0.2, Vitest 5.0.0, Playwright 1.63.0, `@google/genai` 2.21.0, Netlify CLI 27.5.0, `@google/clasp` 3.4.1, Zod, Testing Library, MSW, and axe-core.

**Spec:** `docs/superpowers/specs/2026-09-06-robot-link-webapp-design.md`

## Global Constraints

- Chrome is the guaranteed speech browser; smaller screens retain every function through responsive reflow.
- Gemini model ID is exactly `gemini-3.6-flash`.
- Emotion values are exactly `행복`, `슬픔`, `보통`, `화남`.
- Command values are exactly `전진`, `후진`, `좌회전`, `우회전`.
- Emotion writes target only spreadsheet `1zkaiqCPlOu_3sg2FZEavDRZt1R88G-aVuiefS7puj0g`, tab `시트1`, cell `A2`.
- Command writes target only spreadsheet `1-Kfl3N5dInSFagkL8GaCzyBGHmuUgO2NwQtfx2jDA1M`, tab `음성명령 지게차`, cell `A2`.
- The existing user-supplied Gemini key may be used only as `GEMINI_API_KEY` in `.env.local` and Netlify's server-only environment; its plaintext never enters source, Git, logs, screenshots, test snapshots, or a `VITE_` variable.
- Raw audio is not uploaded. Profile and conversation data remain in browser memory and are not deliberately logged or persisted.
- Do not deploy GAS, push implementation commits, or deploy Netlify until Task 11's complete local gate passes.

## Planned file structure

```text
.
├── apps-script/
│   ├── emotion/{Code.gs,appsscript.json,.clasp.json.example}
│   └── voice/{Code.gs,appsscript.json,.clasp.json.example}
├── public/assets/emotions/{happy,sad,neutral,angry}.webp
├── public/assets/hero/robot-link.webp
├── netlify/functions/
│   ├── _shared/{contracts,env,gemini,gas-client,http}.ts
│   ├── emotion-turn.ts
│   └── voice-command.ts
├── src/
│   ├── app/{App,App.test}.tsx
│   ├── components/{ModeCard,StatusBadge,SpeechButton}.tsx
│   ├── features/emotion/{EmotionFlow,EmotionFlow.test,useEmotionSession}.tsx
│   ├── features/voice/{VoiceFlow,VoiceFlow.test,DirectionPad}.tsx
│   ├── lib/{api,speech,speech.test}.ts
│   ├── styles/{tokens,global}.css
│   └── main.tsx
├── tests/
│   ├── e2e/{mode-selector,emotion-flow,voice-flow,responsive,a11y}.spec.ts
│   ├── fixtures/mock-api.ts
│   ├── gas/{emotion,voice}.test.ts
│   └── security/secrets.test.ts
├── .env.example
├── .gitignore
├── netlify.toml
├── package.json
├── playwright.config.ts
├── tsconfig.json
├── vite.config.ts
└── vitest.setup.ts
```

---

### Task 1: Scaffold the tested React and Netlify workspace

**Files:**
- Create: `package.json`
- Create: `index.html`
- Create: `tsconfig.json`
- Create: `vite.config.ts`
- Create: `vitest.setup.ts`
- Create: `src/main.tsx`
- Create: `src/app/App.tsx`
- Create: `src/app/App.test.tsx`
- Create: `.gitignore`
- Create: `.env.example`
- Create: `netlify.toml`

**Interfaces:**
- Produces: `App(): JSX.Element`, npm scripts used by every later task, and server-only environment variable names.

- [ ] **Step 1: Create the manifest and install pinned dependencies**

Use this script set in `package.json`:

```json
{
  "name": "robot-cont-ai",
  "private": true,
  "version": "0.1.0",
  "type": "module",
  "scripts": {
    "dev": "vite",
    "dev:netlify": "netlify dev",
    "build": "tsc --noEmit && vite build",
    "lint": "eslint . --max-warnings=0",
    "typecheck": "tsc --noEmit",
    "test": "vitest run",
    "test:watch": "vitest",
    "test:e2e": "playwright test",
    "test:gate": "npm run lint && npm run typecheck && npm test && npm run test:e2e && npm run build"
  }
}
```

Install exact versions observed during planning plus compatible latest versions of the test utilities:

```powershell
npm install react@19.2.8 react-dom@19.2.8 zod@latest @google/genai@2.21.0 @netlify/functions@latest
npm install -D vite@8.2.2 typescript@7.0.2 vitest@5.0.0 @vitejs/plugin-react@latest eslint@latest typescript-eslint@latest eslint-plugin-react-hooks@latest eslint-plugin-react-refresh@latest jsdom@latest @testing-library/react@latest @testing-library/jest-dom@latest @testing-library/user-event@latest msw@latest @playwright/test@1.63.0 @axe-core/playwright@latest netlify-cli@27.5.0 @google/clasp@3.4.1
```

- [ ] **Step 2: Write the failing application smoke test**

```tsx
// src/app/App.test.tsx
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { App } from "./App";

describe("App", () => {
  it("offers both robot modes", () => {
    render(<App />);
    expect(screen.getByRole("button", { name: /감정인식로봇/ })).toBeVisible();
    expect(screen.getByRole("button", { name: /음성명령로봇/ })).toBeVisible();
  });
});
```

- [ ] **Step 3: Run the smoke test and verify the red state**

Run: `npm test -- src/app/App.test.tsx`

Expected: FAIL because `App` does not exist yet.

- [ ] **Step 4: Add the minimal app shell and configuration**

```tsx
// src/app/App.tsx
export function App() {
  return (
    <main>
      <h1>오늘은 어떤 로봇과 함께할까요?</h1>
      <button type="button">감정인식로봇</button>
      <button type="button">음성명령로봇</button>
    </main>
  );
}
```

Configure Vitest with `environment: "jsdom"`, `setupFiles: ["./vitest.setup.ts"]`, and tests excluding `tests/e2e/**`. Configure Netlify to publish `dist`, run `npm run build`, and bundle functions from `netlify/functions` with esbuild.

`.env.example` contains names with empty values only:

```dotenv
GEMINI_API_KEY=
EMOTION_GAS_URL=
VOICE_GAS_URL=
EMOTION_GAS_TOKEN=
VOICE_GAS_TOKEN=
E2E_MOCK_MODE=false
```

`.gitignore` must include `.env`, `.env.*`, `!.env.example`, `.netlify`, `dist`, `node_modules`, `playwright-report`, and `test-results`.

- [ ] **Step 5: Verify the green state**

Run: `npm test -- src/app/App.test.tsx && npm run typecheck`

Expected: both commands PASS.

- [ ] **Step 6: Commit**

```powershell
git add package.json package-lock.json index.html tsconfig.json vite.config.ts vitest.setup.ts src/main.tsx src/app/App.tsx src/app/App.test.tsx .gitignore .env.example netlify.toml
git commit -m "chore: scaffold robot link web app"
```

---

### Task 2: Define shared runtime contracts and validation

**Files:**
- Create: `netlify/functions/_shared/contracts.ts`
- Create: `netlify/functions/_shared/contracts.test.ts`
- Create: `netlify/functions/_shared/http.ts`
- Create: `netlify/functions/_shared/env.ts`

**Interfaces:**
- Produces: `Emotion`, `Command`, `EmotionTurnRequest`, `EmotionTurnResult`, `VoiceCommandRequest`, `VoiceCommandResult`, `parseJsonBody()`, and `readServerEnv()`.

- [ ] **Step 1: Write failing contract tests**

```ts
import { describe, expect, it } from "vitest";
import { emotionSchema, emotionTurnRequestSchema, voiceCommandRequestSchema } from "./contracts";

describe("robot contracts", () => {
  it.each(["행복", "슬픔", "보통", "화남"])("accepts emotion %s", (value) => {
    expect(emotionSchema.parse(value)).toBe(value);
  });

  it("rejects an unsupported command", () => {
    expect(() => voiceCommandRequestSchema.parse({ source: "touch", command: "정지" })).toThrow();
  });

  it("bounds profile and history input", () => {
    const value = emotionTurnRequestSchema.parse({
      profile: { name: "민준", age: 10, honorific: "민준아" },
      history: [{ role: "user", text: "오늘 친구와 놀았어요." }]
    });
    expect(value.history).toHaveLength(1);
  });
});
```

- [ ] **Step 2: Run the contract tests and verify failure**

Run: `npm test -- netlify/functions/_shared/contracts.test.ts`

Expected: FAIL because the contract module does not exist.

- [ ] **Step 3: Implement strict schemas**

```ts
import { z } from "zod";

export const emotionSchema = z.enum(["행복", "슬픔", "보통", "화남"]);
export const commandSchema = z.enum(["전진", "후진", "좌회전", "우회전"]);
export type Emotion = z.infer<typeof emotionSchema>;
export type Command = z.infer<typeof commandSchema>;

export const profileSchema = z.object({
  name: z.string().trim().min(1).max(30),
  age: z.number().int().min(4).max(120),
  honorific: z.string().trim().min(1).max(30)
});

export const historyItemSchema = z.object({
  role: z.enum(["user", "assistant"]),
  text: z.string().trim().min(1).max(800)
});

export const emotionTurnRequestSchema = z.object({
  profile: profileSchema,
  history: z.array(historyItemSchema).min(1).max(12)
});

export const emotionTurnResultSchema = z.object({
  reply: z.string().trim().min(1).max(500),
  emotion: emotionSchema.nullable(),
  confidence: z.number().min(0).max(1),
  complete: z.boolean()
}).superRefine((value, context) => {
  if (value.complete && value.emotion === null) {
    context.addIssue({ code: "custom", message: "A completed turn requires an emotion" });
  }
});

export const voiceCommandRequestSchema = z.discriminatedUnion("source", [
  z.object({ source: z.literal("speech"), transcript: z.string().trim().min(1).max(300) }),
  z.object({ source: z.literal("touch"), command: commandSchema })
]);

export const voiceCommandResultSchema = z.object({ command: commandSchema });
```

`readServerEnv()` must require every server secret with Zod and return generic configuration errors without including secret values.

- [ ] **Step 4: Run tests**

Run: `npm test -- netlify/functions/_shared/contracts.test.ts && npm run typecheck`

Expected: PASS.

- [ ] **Step 5: Commit**

```powershell
git add netlify/functions/_shared
git commit -m "feat: define robot API contracts"
```

---

### Task 3: Implement and test the Gemini gateway

**Files:**
- Create: `netlify/functions/_shared/gemini.ts`
- Create: `netlify/functions/_shared/gemini.test.ts`

**Interfaces:**
- Consumes: `EmotionTurnRequest`, `emotionTurnResultSchema`, `voiceCommandResultSchema`.
- Produces: `createGeminiGateway(apiKey)`, `getEmotionTurn(request)`, and `classifyCommand(transcript)`.

- [ ] **Step 1: Write failing behavior tests with an injected model client**

```ts
it("forces the best emotion on the sixth user utterance", async () => {
  const gateway = createGeminiGateway("test-key", fakeGenerate({
    reply: "지금 마음은 평온함에 가까워 보여요.",
    emotion: "보통",
    confidence: 0.72,
    complete: false
  }));
  const result = await gateway.getEmotionTurn(sixUtteranceRequest);
  expect(result).toMatchObject({ emotion: "보통", complete: true });
});

it("rejects model output outside the command allowlist", async () => {
  const gateway = createGeminiGateway("test-key", fakeGenerate({ command: "정지" }));
  await expect(gateway.classifyCommand("멈춰")).rejects.toMatchObject({ code: "UNSUPPORTED_COMMAND" });
});
```

- [ ] **Step 2: Run tests and confirm failure**

Run: `npm test -- netlify/functions/_shared/gemini.test.ts`

Expected: FAIL because the gateway is missing.

- [ ] **Step 3: Implement structured Gemini calls**

Initialize only inside the server function:

```ts
const ai = new GoogleGenAI({ apiKey });
const response = await ai.models.generateContent({
  model: "gemini-3.6-flash",
  contents: prompt,
  config: {
    responseMimeType: "application/json",
    responseJsonSchema: emotionJsonSchema
  }
});
return emotionTurnResultSchema.parse(JSON.parse(response.text ?? ""));
```

The emotion system instructions must require one empathetic question per turn, use the supplied honorific naturally, prohibit diagnosis, restrict the result enum, defer completion until at least three user utterances, and include the trusted-adult safety instruction. The command instructions must map Korean paraphrases only to the four allowed movements and return an unsupported-command error when intent is ambiguous.

Retry a transient Gemini failure exactly once. Do not retry schema violations into an unbounded loop. Never call `console.log` with prompts, profiles, transcripts, histories, responses, or API errors containing request bodies.

- [ ] **Step 4: Verify tests and types**

Run: `npm test -- netlify/functions/_shared/gemini.test.ts && npm run typecheck`

Expected: PASS.

- [ ] **Step 5: Commit**

```powershell
git add netlify/functions/_shared/gemini.ts netlify/functions/_shared/gemini.test.ts
git commit -m "feat: add structured Gemini gateway"
```

---

### Task 4: Build the two isolated GAS writers and server client

**Files:**
- Create: `apps-script/emotion/Code.gs`
- Create: `apps-script/emotion/appsscript.json`
- Create: `apps-script/emotion/.clasp.json.example`
- Create: `apps-script/voice/Code.gs`
- Create: `apps-script/voice/appsscript.json`
- Create: `apps-script/voice/.clasp.json.example`
- Create: `tests/gas/harness.ts`
- Create: `tests/gas/emotion.test.ts`
- Create: `tests/gas/voice.test.ts`
- Create: `netlify/functions/_shared/gas-client.ts`
- Create: `netlify/functions/_shared/gas-client.test.ts`

**Interfaces:**
- Produces GAS `doGet(e)` and `doPost(e)` functions plus `createGasClient(config).saveEmotion(value, requestId)` and `.saveCommand(value, requestId)`.

- [ ] **Step 1: Write failing GAS contract tests**

Load each `Code.gs` in a Node VM with stubs for `PropertiesService`, `SpreadsheetApp`, `LockService`, and `ContentService`.

```ts
it("writes an allowed emotion to the exact A2 range", () => {
  const gas = loadGas("apps-script/emotion/Code.gs", emotionServices);
  const response = gas.doPost(eventFor({ token: "secret", requestId: "req-1", value: "행복" }));
  expect(emotionServices.openById).toHaveBeenCalledWith("1zkaiqCPlOu_3sg2FZEavDRZt1R88G-aVuiefS7puj0g");
  expect(emotionServices.getSheetByName).toHaveBeenCalledWith("시트1");
  expect(emotionServices.getRange).toHaveBeenCalledWith("A2");
  expect(emotionServices.setValue).toHaveBeenCalledWith("행복");
  expect(readGasJson(response)).toMatchObject({ ok: true });
});

it("does not write an unsupported voice command", () => {
  const gas = loadGas("apps-script/voice/Code.gs", voiceServices);
  expect(() => gas.doPost(eventFor({ token: "secret", requestId: "req-2", value: "정지" }))).not.toThrow();
  expect(voiceServices.setValue).not.toHaveBeenCalled();
});
```

- [ ] **Step 2: Run tests and confirm failure**

Run: `npm test -- tests/gas`

Expected: FAIL because GAS files and harness are missing.

- [ ] **Step 3: Implement the explicit GAS writer pattern twice**

Each project uses immutable code constants for the approved sheet ID, tab, target range, and allowlist, while the token comes from `PropertiesService.getScriptProperties().getProperty("API_TOKEN")`.

```js
function doPost(e) {
  var body = parseBody_(e);
  var expectedToken = PropertiesService.getScriptProperties().getProperty("API_TOKEN");
  if (!expectedToken || body.token !== expectedToken) return json_({ ok: false, code: "UNAUTHORIZED" });
  if (!body.requestId || ALLOWED_VALUES.indexOf(body.value) === -1) return json_({ ok: false, code: "INVALID_REQUEST" });

  var lock = LockService.getScriptLock();
  lock.waitLock(5000);
  try {
    var properties = PropertiesService.getScriptProperties();
    if (properties.getProperty("LAST_REQUEST_ID") === body.requestId) return json_({ ok: true, duplicate: true });
    SpreadsheetApp.openById(SPREADSHEET_ID).getSheetByName(SHEET_NAME).getRange("A2").setValue(body.value);
    properties.setProperty("LAST_REQUEST_ID", body.requestId);
    return json_({ ok: true, duplicate: false });
  } finally {
    lock.releaseLock();
  }
}
```

Use `doGet` for `{ ok: true, service: "emotion" | "voice" }` only. Set `timeZone` to `Asia/Seoul` and exception logging to `STACKDRIVER` in both manifests. Do not put live script IDs in committed `.clasp.json` files; examples contain only the expected JSON shape.

- [ ] **Step 4: Implement the Netlify GAS client**

The client posts `{ token, requestId, value }`, follows the GAS redirect, enforces a timeout with `AbortSignal.timeout(8000)`, and accepts success only when both HTTP status and `{ ok: true }` are present. It must return typed error codes without response-body secrets.

- [ ] **Step 5: Run tests**

Run: `npm test -- tests/gas netlify/functions/_shared/gas-client.test.ts`

Expected: PASS for allowed values, exact targets, duplicate IDs, bad tokens, timeouts, and invalid GAS JSON.

- [ ] **Step 6: Commit**

```powershell
git add apps-script tests/gas netlify/functions/_shared/gas-client.ts netlify/functions/_shared/gas-client.test.ts
git commit -m "feat: add isolated Google Sheet writers"
```

---

### Task 5: Expose secure Netlify Function endpoints

**Files:**
- Create: `netlify/functions/emotion-turn.ts`
- Create: `netlify/functions/emotion-turn.test.ts`
- Create: `netlify/functions/voice-command.ts`
- Create: `netlify/functions/voice-command.test.ts`

**Interfaces:**
- Consumes: shared schemas, Gemini gateway, and GAS client.
- Produces: `POST /.netlify/functions/emotion-turn` and `POST /.netlify/functions/voice-command`.

- [ ] **Step 1: Write failing endpoint tests**

```ts
it("saves only when an emotion turn completes", async () => {
  const handler = createEmotionHandler({
    getEmotionTurn: vi.fn().mockResolvedValue({ reply: "오늘은 행복에 가까워 보여요.", emotion: "행복", confidence: 0.9, complete: true }),
    saveEmotion: vi.fn().mockResolvedValue(undefined),
    createRequestId: () => "emotion-1"
  });
  const response = await handler(postEvent(validEmotionRequest));
  expect(response.statusCode).toBe(200);
  expect(JSON.parse(response.body)).toMatchObject({ emotion: "행복", complete: true, saved: true });
});

it("bypasses Gemini for a touch command", async () => {
  const classifyCommand = vi.fn();
  const saveCommand = vi.fn().mockResolvedValue(undefined);
  const handler = createVoiceHandler({ classifyCommand, saveCommand, createRequestId: () => "voice-1" });
  await handler(postEvent({ source: "touch", command: "전진" }));
  expect(classifyCommand).not.toHaveBeenCalled();
  expect(saveCommand).toHaveBeenCalledWith("전진", "voice-1");
});
```

- [ ] **Step 2: Run endpoint tests and confirm failure**

Run: `npm test -- netlify/functions/emotion-turn.test.ts netlify/functions/voice-command.test.ts`

Expected: FAIL because handlers are missing.

- [ ] **Step 3: Implement dependency-injected handlers**

Both handlers accept only POST and JSON content, parse with the shared schemas, return `400` for invalid input, `422` for unsupported speech commands, `502` for Gemini/GAS failures, and `200` for success. Return Korean recovery messages and machine-readable codes. Never reflect raw exceptions or supplied payloads.

For emotion, set `saved: false` when `complete` is false; call GAS only for a completed, allowed emotion. For voice, classify speech but directly validate touch. Generate request IDs with `crypto.randomUUID()`.

- [ ] **Step 4: Run endpoint and full unit tests**

Run: `npm test -- netlify/functions && npm run typecheck`

Expected: PASS.

- [ ] **Step 5: Commit**

```powershell
git add netlify/functions/emotion-turn.ts netlify/functions/emotion-turn.test.ts netlify/functions/voice-command.ts netlify/functions/voice-command.test.ts
git commit -m "feat: add secure robot API functions"
```

---

### Task 6: Generate and verify the approved raster assets

**Files:**
- Create: `public/assets/hero/robot-link.webp`
- Create: `public/assets/emotions/happy.webp`
- Create: `public/assets/emotions/sad.webp`
- Create: `public/assets/emotions/neutral.webp`
- Create: `public/assets/emotions/angry.webp`

**Interfaces:**
- Produces: five optimized raster assets with stable paths consumed by the UI.

- [ ] **Step 1: Generate the hero with the built-in ImageGen tool**

Use this approved prompt:

```text
Use case: stylized-concept
Asset type: responsive robot web app hero cutout
Primary request: create one friendly original home-assistant robot that visually connects an emotion conversation mode and a movement command mode
Scene/backdrop: transparent or clean pale ice-blue studio backdrop suitable for edge extraction
Subject: compact rounded 3D robot, expressive digital face, soft white ceramic shell, subtle deep-teal joints, one coral light and one aqua light
Style/medium: polished soft 3D product illustration inspired by optimistic smart-home interfaces, original character design
Composition/framing: centered three-quarter view, full body, generous breathing room, readable at tablet kiosk size
Lighting/mood: soft diffused daylight, reassuring and playful
Color palette: #EAF8FB, #073E4A, #24C7D1, #FF7D7A, #A99CF5
Constraints: no text, no logo, no watermark, no copied character, simple silhouette, accessible contrast
Avoid: humanoid realism, weapons, dark sci-fi, busy room, brand identifiers
```

- [ ] **Step 2: Generate the four emotion illustrations as a consistent family**

Use one prompt per emotion, changing only the expression and a small atmospheric motif:

```text
Use case: stylized-concept
Asset type: emotion result card illustration
Primary request: the same original compact rounded 3D robot clearly expressing <행복|슬픔|보통|화남>
Scene/backdrop: clean pale ice-blue studio backdrop
Style/medium: polished soft 3D product illustration matching the approved hero robot
Composition/framing: centered bust portrait, consistent camera angle and scale across all four images
Lighting/mood: gentle, safe, child-friendly; emotion is readable without text
Color palette: #EAF8FB, #073E4A, #24C7D1, #FF7D7A, #A99CF5
Constraints: identical character identity, shell, proportions, and framing; no text, logo, watermark, or brand identifier
Avoid: frightening anger, melodramatic distress, copied characters, clutter
```

- [ ] **Step 3: Inspect and normalize assets**

Use visual inspection on every output. Reject inconsistent robot identity, unreadable emotion, clipped body parts, text artifacts, or reference-copying. Convert accepted files to WebP at a visually lossless quality, keep the hero under 700 KB and each emotion image under 350 KB, and verify intrinsic dimensions are at least 1024 px on the long edge.

- [ ] **Step 4: Commit**

```powershell
git add public/assets
git commit -m "feat: add original robot artwork"
```

---

### Task 7: Build the visual system and responsive mode selector

**Files:**
- Create: `src/styles/tokens.css`
- Create: `src/styles/global.css`
- Create: `src/components/ModeCard.tsx`
- Create: `src/components/StatusBadge.tsx`
- Modify: `src/app/App.tsx`
- Modify: `src/app/App.test.tsx`

**Interfaces:**
- Produces: `Mode = "home" | "emotion" | "voice"`, responsive navigation, and reusable mode/status components.

- [ ] **Step 1: Expand the failing app tests**

Test accessible buttons, mode transitions, the home action, hero image alt text, and absence of horizontal overflow at class-controlled layout widths.

```tsx
it("opens and exits emotion mode", async () => {
  const user = userEvent.setup();
  render(<App />);
  await user.click(screen.getByRole("button", { name: /감정인식로봇 시작/ }));
  expect(screen.getByRole("heading", { name: /오늘의 기분/ })).toBeVisible();
  await user.click(screen.getByRole("button", { name: /처음으로/ }));
  expect(screen.getByRole("heading", { name: /어떤 로봇/ })).toBeVisible();
});
```

- [ ] **Step 2: Run the selector tests and confirm failure**

Run: `npm test -- src/app/App.test.tsx`

Expected: FAIL on missing navigation and polished components.

- [ ] **Step 3: Implement the reference-adapted design**

Define CSS custom properties for the approved five-color palette, fluid spacing and type scales, radii, shadows, and motion durations. Create the central robot with two code-native orbit arcs. Use wide three-column layout at 1200 px, robot-first plus two-column cards from 768–1199 px, and one-column flow below 768 px. Primary controls use at least 64 px height, `:focus-visible`, and reduced-motion overrides.

Use meaningful Korean copy only. Do not reproduce reference logos, text, floor plans, device screens, or exact composition.

- [ ] **Step 4: Run tests and build**

Run: `npm test -- src/app/App.test.tsx && npm run build`

Expected: PASS with no overflow or missing assets.

- [ ] **Step 5: Commit**

```powershell
git add src/styles src/components src/app
git commit -m "feat: add responsive robot mode selector"
```

---

### Task 8: Implement the Chrome speech adapter and emotion journey

**Files:**
- Create: `src/lib/api.ts`
- Create: `src/lib/speech.ts`
- Create: `src/lib/speech.test.ts`
- Create: `src/components/SpeechButton.tsx`
- Create: `src/features/emotion/useEmotionSession.ts`
- Create: `src/features/emotion/EmotionFlow.tsx`
- Create: `src/features/emotion/EmotionFlow.test.tsx`

**Interfaces:**
- Produces: `createSpeechAdapter()`, `speakKorean(text)`, `postEmotionTurn(request)`, `useEmotionSession()`, and `EmotionFlow({ onExit })`.

- [ ] **Step 1: Write failing speech and emotion-flow tests**

```ts
it("uses Korean recognition and returns the final transcript", async () => {
  const adapter = createSpeechAdapter(FakeSpeechRecognition);
  const listening = adapter.listen();
  FakeSpeechRecognition.instance.emitResult("친구와 놀아서 즐거웠어요");
  await expect(listening).resolves.toBe("친구와 놀아서 즐거웠어요");
  expect(FakeSpeechRecognition.instance.lang).toBe("ko-KR");
});
```

```tsx
it("collects profile data and reveals the result after a completed turn", async () => {
  server.use(mockEmotionTurn({ reply: "행복한 하루였군요.", emotion: "행복", confidence: 0.94, complete: true, saved: true }));
  render(<EmotionFlow onExit={vi.fn()} />);
  await fillProfileAndSubmit({ name: "민준", age: "10", honorific: "민준아" });
  await submitFallbackText("친구와 놀아서 즐거웠어요");
  expect(await screen.findByRole("heading", { name: "행복" })).toBeVisible();
  expect(screen.getByText(/시트에 전달했어요/)).toBeVisible();
});
```

- [ ] **Step 2: Run tests and confirm failure**

Run: `npm test -- src/lib/speech.test.ts src/features/emotion/EmotionFlow.test.tsx`

Expected: FAIL because speech and emotion modules are missing.

- [ ] **Step 3: Implement the speech boundary**

Wrap `window.SpeechRecognition ?? window.webkitSpeechRecognition` behind an injectable adapter. Set `lang = "ko-KR"`, `interimResults = true`, `continuous = false`, and clean up every handler on result, error, unmount, or cancellation. Map `not-allowed`, `no-speech`, `audio-capture`, and unsupported-browser cases to stable application error codes. Speech synthesis selects a Korean voice when available and respects an in-app mute control.

- [ ] **Step 4: Implement the emotion state machine and screens**

Keep profile and at most twelve history items in component memory. Use explicit phases: `profile`, `ready`, `listening`, `thinking`, `speaking`, `saving-error`, and `result`. Disable duplicate submission while active. Provide typed-text fallback at all times. Persist nothing to localStorage, sessionStorage, cookies, analytics, or logs.

Map emotion assets exactly:

```ts
const emotionAssets = {
  행복: "/assets/emotions/happy.webp",
  슬픔: "/assets/emotions/sad.webp",
  보통: "/assets/emotions/neutral.webp",
  화남: "/assets/emotions/angry.webp"
} as const;
```

- [ ] **Step 5: Run tests and accessibility assertions**

Run: `npm test -- src/lib/speech.test.ts src/features/emotion/EmotionFlow.test.tsx && npm run typecheck`

Expected: PASS for success, unsupported speech, permission denial, text fallback, save retry, and exit cleanup.

- [ ] **Step 6: Commit**

```powershell
git add src/lib src/components/SpeechButton.tsx src/features/emotion
git commit -m "feat: add empathetic emotion conversation"
```

---

### Task 9: Implement the voice and touch command journey

**Files:**
- Create: `src/features/voice/DirectionPad.tsx`
- Create: `src/features/voice/VoiceFlow.tsx`
- Create: `src/features/voice/VoiceFlow.test.tsx`
- Modify: `src/lib/api.ts`
- Modify: `src/app/App.tsx`

**Interfaces:**
- Produces: `postVoiceCommand(request)`, `DirectionPad({ disabled, onCommand })`, and `VoiceFlow({ onExit })`.

- [ ] **Step 1: Write failing touch and speech tests**

```tsx
it.each(["전진", "후진", "좌회전", "우회전"] as const)("sends touch command %s", async (command) => {
  const user = userEvent.setup();
  server.use(mockVoiceCommand({ command, saved: true }));
  render(<VoiceFlow onExit={vi.fn()} />);
  await user.click(screen.getByRole("button", { name: /안내 확인/ }));
  await user.click(screen.getByRole("button", { name: command }));
  expect(await screen.findByText(`${command} 명령을 전달했어요.`)).toBeVisible();
});

it("does not claim success for an unsupported spoken command", async () => {
  server.use(mockUnsupportedCommand());
  render(<VoiceFlow onExit={vi.fn()} />);
  await completeVoiceIntro();
  await emitSpeech("불을 켜 줘");
  expect(await screen.findByText(/전진, 후진, 좌회전, 우회전 중 하나/)).toBeVisible();
});
```

- [ ] **Step 2: Run tests and confirm failure**

Run: `npm test -- src/features/voice/VoiceFlow.test.tsx`

Expected: FAIL because voice components are missing.

- [ ] **Step 3: Implement the instruction panel and controller**

Show the instruction panel on every fresh entry. Use a semantic four-button direction pad around a central microphone control. Buttons send `{ source: "touch", command }`; speech sends `{ source: "speech", transcript }`. Use SVG arrows with accompanying visible Korean labels. Provide `aria-live="polite"` for listening, sending, success, and error states. Keep controls disabled only while a request is active.

- [ ] **Step 4: Run tests**

Run: `npm test -- src/features/voice/VoiceFlow.test.tsx && npm run typecheck`

Expected: PASS for the intro, all four buttons, spoken classification, ambiguous input, network error, save retry, and return home.

- [ ] **Step 5: Commit**

```powershell
git add src/features/voice src/lib/api.ts src/app/App.tsx
git commit -m "feat: add voice and touch robot controls"
```

---

### Task 10: Add local integration, responsive, accessibility, and secret tests

**Files:**
- Create: `tests/fixtures/mock-api.ts`
- Create: `tests/e2e/mode-selector.spec.ts`
- Create: `tests/e2e/emotion-flow.spec.ts`
- Create: `tests/e2e/voice-flow.spec.ts`
- Create: `tests/e2e/responsive.spec.ts`
- Create: `tests/e2e/a11y.spec.ts`
- Create: `tests/security/secrets.test.ts`
- Create: `playwright.config.ts`

**Interfaces:**
- Produces: deterministic browser tests that never call Gemini or live GAS and a repository/build secret scanner.

- [ ] **Step 1: Configure Chromium tests with API interception**

Use Playwright `webServer` with `npm run dev -- --host 127.0.0.1`, intercept both `/.netlify/functions/*` paths, and return deterministic fixtures. Do not enable `E2E_MOCK_MODE` in production code.

- [ ] **Step 2: Write end-to-end flow tests**

Test the complete profile → three mocked conversations → emotion result path and intro → voice/touch → success path. Assert exact visible values and request JSON shapes without snapshotting personal data.

- [ ] **Step 3: Write responsive tests**

Run the mode selector and both control surfaces at these viewports:

```ts
const viewports = [
  { name: "laptop", width: 1440, height: 900 },
  { name: "tablet-landscape", width: 1024, height: 768 },
  { name: "tablet-portrait", width: 768, height: 1024 },
  { name: "small-screen", width: 390, height: 844 }
];
```

For each viewport, assert `document.documentElement.scrollWidth <= window.innerWidth`, primary controls are visible, and every direction button has a bounding box of at least 64×64 px on tablet and kiosk sizes.

- [ ] **Step 4: Add axe and keyboard tests**

```ts
const results = await new AxeBuilder({ page }).analyze();
expect(results.violations).toEqual([]);
```

Tab through both modes, verify visible focus, and emulate reduced motion to ensure no essential state depends on animation.

- [ ] **Step 5: Add secret scanning tests**

Recursively scan tracked source candidates plus `dist` after build. Fail on key-like patterns, the literal known key prefix, `GEMINI_API_KEY=` followed by a nonempty value, secret GAS tokens, or `VITE_GEMINI`. Explicitly allow empty names in `.env.example`. Never print a detected secret; output only the relative file path and rule name.

- [ ] **Step 6: Run the local browser and security suite**

Run:

```powershell
npx playwright install chromium
npm run build
npm test -- tests/security/secrets.test.ts
npm run test:e2e
```

Expected: all tests PASS with no live external writes.

- [ ] **Step 7: Perform visual QA**

Open the local site in Chrome at the three primary viewport sizes. Compare palette, hierarchy, rounded panels, central robot composition, and image integration against the recorded reference evidence. Inspect every generated asset. Correct clipping, low contrast, overflow, broken focus, inconsistent robot identity, and excessive animation, then rerun affected tests.

- [ ] **Step 8: Commit**

```powershell
git add tests playwright.config.ts src
git commit -m "test: cover responsive robot journeys"
```

---

### Task 11: Pass the complete local release gate

**Files:**
- Modify only files required by verified failures.
- Keep local-only secret file: `.env.local` (ignored; never stage it).

**Interfaces:**
- Produces: a reproducible all-green local build and recorded verification evidence.

- [ ] **Step 1: Configure the existing Gemini key locally without displaying it**

Set `GEMINI_API_KEY` in ignored `.env.local` through a local secret-safe input method. Verify only that the variable is present and nonempty; never print it. Leave GAS URLs/tokens unset for mocked local tests.

- [ ] **Step 2: Run a real Gemini-only smoke test**

Start `netlify dev`, submit one benign command classification and one short emotion turn, and assert that returned JSON satisfies the shared schemas. Do not send profile details beyond synthetic test data. Do not call either live GAS endpoint.

- [ ] **Step 3: Run the exact full gate**

Run: `npm run test:gate`

Expected: lint, typecheck, all Vitest tests, all Playwright tests, and production build PASS in one command.

- [ ] **Step 4: Inspect Git safety**

Run:

```powershell
git status --short
git diff --check
git grep -n -I -E "GEMINI_API_KEY=.+|VITE_GEMINI|AIza|AQ\.[A-Za-z0-9_-]{20,}"
```

Expected: `.env.local` is absent from Git status; grep finds no secret-bearing tracked content. Do not display matching secret text if a scan fails; use the Vitest secret scanner to identify the file safely.

- [ ] **Step 5: Commit any gate fixes and rerun**

After every fix, rerun the smallest failing test first and then `npm run test:gate`. Stop only when the complete command exits zero.

---

### Task 12: Deploy both GAS APIs, GitHub, and Netlify once

**Files:**
- Create locally and ignore: `apps-script/emotion/.clasp.json`
- Create locally and ignore: `apps-script/voice/.clasp.json`
- Modify tracked documentation only if final operational commands need correction.

**Interfaces:**
- Produces: two GAS deployment URLs, one GitHub `main` branch, one Netlify production URL, and verified A2 writes.

- [ ] **Step 1: Reconfirm the local gate result**

Run: `npm run test:gate`

Expected: exit code 0 immediately before deployment. If it fails, do not deploy.

- [ ] **Step 2: Authenticate CLI tools without exposing credentials**

Run interactive `npx clasp login`, `gh auth status`, and `npx netlify status`. Complete browser authentication only when required. Do not paste tokens into source or echoed command arguments.

- [ ] **Step 3: Create or link two bound GAS projects**

From each GAS directory, create or link a script bound to the exact approved parent spreadsheet. Verify returned script IDs without committing them. Push each project and create one web-app deployment executing as the owner and accessible to anyone holding the endpoint.

- [ ] **Step 4: Configure GAS authentication tokens**

Generate separate high-entropy tokens for emotion and voice. Store each only in its GAS Script Properties as `API_TOKEN` and in the corresponding local/Netlify server environment variable. Never reuse the Gemini key as a GAS token and never print token values.

- [ ] **Step 5: Verify GAS health before connecting production**

Call each `doGet` deployment URL and require `{ ok: true, service: "emotion" }` or `{ ok: true, service: "voice" }`. Do not perform A2 writes yet.

- [ ] **Step 6: Configure Netlify's server-only variables**

Set `GEMINI_API_KEY`, `EMOTION_GAS_URL`, `VOICE_GAS_URL`, `EMOTION_GAS_TOKEN`, and `VOICE_GAS_TOKEN` with Netlify CLI secret-safe input. Confirm variable names exist without fetching or printing their values.

- [ ] **Step 7: Push the verified implementation**

```powershell
git status --short
git log --oneline --decorate -12
git push -u origin main
```

Expected: clean worktree and successful push to `https://github.com/gud8238/robot_cont_ai`.

- [ ] **Step 8: Deploy production once**

Link or initialize the intended Netlify site with CLI, then run `npx netlify deploy --prod --build`. Record the production URL returned by the CLI. Do not trigger additional deploys during inspection.

- [ ] **Step 9: Run production Chrome smoke tests**

Verify mode selection, microphone permission guidance, one synthetic emotion flow, one spoken movement command, and one touch movement command. Confirm no secret appears in page source, JS bundles, network responses, console output, or error UI.

- [ ] **Step 10: Verify live sheet targets**

Read `시트1!A2` and `음성명령 지게차!A2` through the Google Drive connector. Require an allowed value in each exact cell and confirm A1 and unrelated cells were not modified by the app workflow.

- [ ] **Step 11: Report deployment evidence**

Provide the GitHub commit, Netlify production link, both GAS health results without secret URLs if the user prefers them private, exact verified sheet/tab/range names, and the final local/production test results. Do not include secret values.

## Plan self-review

- Every approved spec requirement maps to a task: architecture and secrets (Tasks 1–5), generated assets and reference-driven UI (Tasks 6–7), emotion STS (Task 8), voice/touch controls (Task 9), responsive/accessibility/security tests (Task 10), local-only release gate (Task 11), and one final deployment sequence (Task 12).
- Shared types and enum names remain consistent across client, Netlify Functions, GAS, and tests.
- The live sheets cannot be written before the complete local gate because all pre-release browser and integration tests intercept external APIs.
- The plan contains no unresolved implementation placeholders; operational secret values are intentionally omitted and supplied only through approved secret stores.
