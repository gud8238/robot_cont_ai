# Short Emotion Result Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 감정 대화를 2~3회 문답으로 끝내고 모바일 결과 로봇 이미지를 한 화면에 적합한 크기로 줄인다.

**Architecture:** 서버의 Gemini gateway가 사용자 발화 수에 따라 완료 경계를 보정하며, 기존 React 결과 컴포넌트는 유지하고 모바일 미디어 쿼리에서 이미지와 카드 밀도만 조정한다. 외부 API와 시트 저장 계약은 변경하지 않는다.

**Tech Stack:** TypeScript, React 19, Vitest, Playwright, CSS, Netlify Functions

**Spec:** `docs/superpowers/specs/2026-09-08-short-emotion-result.md`

## Global Constraints

- Gemini 모델은 `gemini-3.5-flash-lite`를 유지한다.
- 사용자 발화 1회에는 완료하지 않고, 2회에는 조기 완료를 허용하며, 3회에는 반드시 완료한다.
- Google Sheets 저장과 안전 안내 동작은 유지한다.
- 신규 래스터 자산을 만들지 않고 기존 감정 이미지를 재사용한다.
- 모든 로컬 테스트 후 마지막에 프로덕션 배포를 한 번만 실행한다.

---

### Task 1: Bound the emotion conversation

**Files:**
- Modify: `tests/netlify/functions/_shared/gemini.test.ts`
- Modify: `netlify/functions/_shared/gemini.ts`

**Interfaces:**
- Consumes: `EmotionTurnRequest.history`
- Produces: `createGeminiGateway().getEmotionTurn()` with the 1/2/3-turn completion contract

- [x] **Step 1: Write failing boundary tests**

Add tests proving that the first user utterance cannot complete, the second can complete when Gemini is confident, and the third is forced complete with a non-null emotion schema.

- [x] **Step 2: Verify the boundary tests fail**

Run: `npx vitest run tests/netlify/functions/_shared/gemini.test.ts`

Expected: the old three/six-turn thresholds fail the new first/second/third-turn assertions.

- [x] **Step 3: Implement the minimal gateway change**

Change the lower completion guard from three to two user utterances and the forced-completion/schema boundary from six to three. Update the prompt so incomplete replies ask one question while complete replies give a concise empathetic summary.

- [x] **Step 4: Verify the focused tests pass**

Run: `npx vitest run tests/netlify/functions/_shared/gemini.test.ts`

Expected: all gateway tests pass.

### Task 2: Compact the mobile result card

**Files:**
- Modify: `tests/e2e/responsive.spec.ts`
- Modify: `src/styles/global.css`

**Interfaces:**
- Consumes: the existing `.emotion-result__card` markup and emotion image
- Produces: a mobile image bounding box no larger than 320px while preserving the desktop layout

- [x] **Step 1: Write a failing mobile layout test**

Drive the mocked emotion flow to completion at a 390x844 viewport and assert the result image width and height are at most 320px with no horizontal overflow.

- [x] **Step 2: Verify the layout test fails**

Run: `npx playwright test tests/e2e/responsive.spec.ts --grep "compact emotion result"`

Expected: the current full-width result image exceeds 320px.

- [x] **Step 3: Implement the mobile CSS constraint**

At 719px and below, center the result image at `width: min(100%, 320px)`, keep a square aspect ratio, and reduce card padding and gaps.

- [x] **Step 4: Verify the focused layout test passes**

Run the same Playwright command and expect it to pass.

### Task 3: Verify and release

**Files:**
- Modify only if verification exposes a regression.

**Interfaces:**
- Consumes: Tasks 1 and 2
- Produces: a tested GitHub `main` commit and one Netlify production deployment

- [x] **Step 1: Run the complete local gate**

Run: `npm run test:gate`

Expected: lint, typecheck, build, 143+ tests, and all E2E tests pass.

- [x] **Step 2: Inspect the mobile result in Chrome**

Verify the local page uses the compact result layout and has no overflow.

- [ ] **Step 3: Commit and push**

Commit the implementation and push `HEAD` to `origin/main`.

- [ ] **Step 4: Deploy once to Netlify**

Run `npx netlify deploy --prod` only after all local checks pass, then verify the production page.
