import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";
import { installDeterministicSpeech, installMockApi } from "../fixtures/mock-api";

async function startEmotionConversation(page: Parameters<typeof installMockApi>[0]) {
  await page.getByRole("button", { name: "감정인식로봇 시작" }).click();
  await page.getByRole("textbox", { name: "이름", exact: true }).fill("하늘");
  await page.getByRole("spinbutton", { name: "나이" }).fill("10");
  await page.getByRole("textbox", { name: "불러줬으면 하는 이름" }).fill("하늘아");
  await page.getByRole("button", { name: "대화 시작" }).click();
  await expect(page.getByRole("textbox", { name: "직접 입력" })).toBeVisible();
}

async function completeEmotionResult(page: Parameters<typeof installMockApi>[0]) {
  const textBox = page.getByRole("textbox", { name: "직접 입력" });
  for (const message of ["친구와 공원에서 신나게 놀았어요.", "함께 웃었던 순간이 가장 기억나요.", "생각할수록 기분이 좋아져요."]) {
    await textBox.fill(message);
    await page.getByRole("button", { name: "보내기" }).click();
  }
  await expect(page.getByRole("heading", { level: 1, name: "행복" })).toBeVisible();
}

test("has no axe violations on the mode selector and profile form", async ({ page }) => {
  await installMockApi(page);
  await page.goto("/");
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  await page.getByRole("button", { name: "감정인식로봇 시작" }).click();
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
});

test("shows keyboard focus for each mode selection control", async ({ page }) => {
  await installMockApi(page);
  await page.goto("/");
  const emotion = page.getByRole("button", { name: "감정인식로봇 시작" });
  const voice = page.getByRole("button", { name: "음성명령로봇 시작" });
  await page.keyboard.press("Tab");
  await expect(emotion).toBeFocused();
  await expect(emotion).toHaveCSS("outline-style", "solid");
  await page.keyboard.press("Tab");
  await expect(voice).toBeFocused();
  await expect(voice).toHaveCSS("outline-style", "solid");
});

test("has no axe violations in emotion conversation and saved-result states", async ({ page }) => {
  await installDeterministicSpeech(page);
  await installMockApi(page);
  await page.goto("/");
  await startEmotionConversation(page);
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  await completeEmotionResult(page);
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
});

test("has no axe violations in voice introduction and controller states", async ({ page }) => {
  await installMockApi(page);
  await page.goto("/");
  await page.getByRole("button", { name: "음성명령로봇 시작" }).click();
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  await page.getByRole("button", { name: "안내 확인" }).click();
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
});

test("keeps keyboard focus visible through emotion and voice journey controls", async ({ page }) => {
  await installDeterministicSpeech(page);
  await installMockApi(page);
  await page.goto("/");
  await startEmotionConversation(page);
  const conversationHeading = page.getByRole("heading", { level: 1, name: "어떤 일이 있었나요?" });
  await conversationHeading.press("Tab");
  const speechButton = page.getByRole("button", { name: "음성으로 말하기" });
  await expect(speechButton).toBeFocused();
  await expect(speechButton).toHaveCSS("outline-style", "solid");
  await completeEmotionResult(page);
  const resultHeading = page.getByRole("heading", { level: 1, name: "행복" });
  await resultHeading.press("Shift+Tab");
  await expect(page.getByRole("button", { name: "처음으로" })).toBeFocused();
  await page.getByRole("button", { name: "처음으로" }).click();
  await page.getByRole("button", { name: "음성명령로봇 시작" }).click();
  const voiceIntroHeading = page.getByRole("heading", { level: 1, name: "음성명령을 내려주세요" });
  await voiceIntroHeading.press("Tab");
  await expect(page.getByRole("button", { name: "안내 확인" })).toBeFocused();
  await page.getByRole("button", { name: "안내 확인" }).click();
  const controllerHeading = page.getByRole("heading", { level: 1, name: "로봇을 어디로 움직일까요?" });
  await controllerHeading.press("Tab");
  const forward = page.getByRole("button", { name: "전진" });
  await expect(forward).toBeFocused();
  await expect(forward).toHaveCSS("outline-style", "solid");
});

test.use({ reducedMotion: "reduce" });

test("retains emotion conversation and voice touch controls when reduced motion is requested", async ({ page }) => {
  await installMockApi(page);
  await page.goto("/");
  const modeButton = page.getByRole("button", { name: "감정인식로봇 시작" });
  await expect(modeButton).toHaveCSS("transition-duration", "0s");
  await modeButton.click();
  await page.getByRole("textbox", { name: "이름", exact: true }).fill("하늘");
  await page.getByRole("spinbutton", { name: "나이" }).fill("10");
  await page.getByRole("textbox", { name: "불러줬으면 하는 이름" }).fill("하늘아");
  await page.getByRole("button", { name: "대화 시작" }).click();
  await expect(page.getByRole("textbox", { name: "직접 입력" })).toBeVisible();
  await page.getByRole("button", { name: "처음으로" }).click();
  await page.getByRole("button", { name: "음성명령로봇 시작" }).click();
  await page.getByRole("button", { name: "안내 확인" }).click();
  await expect(page.getByRole("button", { name: "전진" })).toBeVisible();
  await expect(page.getByRole("button", { name: "전진" })).toHaveCSS("touch-action", "manipulation");
});
