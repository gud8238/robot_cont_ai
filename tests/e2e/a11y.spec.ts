import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";
import { installMockApi } from "../fixtures/mock-api";

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

test.use({ reducedMotion: "reduce" });

test("retains navigation and touch controls when reduced motion is requested", async ({ page }) => {
  await installMockApi(page);
  await page.goto("/");
  const modeButton = page.getByRole("button", { name: "음성명령로봇 시작" });
  await expect(modeButton).toHaveCSS("transition-duration", "0s");
  await modeButton.click();
  await page.getByRole("button", { name: "안내 확인" }).click();
  await expect(page.getByRole("button", { name: "전진" })).toBeVisible();
  await expect(page.getByRole("button", { name: "전진" })).toHaveCSS("touch-action", "manipulation");
});
