import { expect, test } from "@playwright/test";
import { installDeterministicSpeech, installMockApi } from "../fixtures/mock-api";

test("uses the voice introduction before sending touch and spoken command contracts", async ({ page }) => {
  await installDeterministicSpeech(page, "앞으로 가");
  const api = await installMockApi(page);
  await page.goto("/");
  await page.getByRole("button", { name: "음성명령로봇 시작" }).click();
  await expect(page.getByRole("heading", { level: 1, name: "음성명령을 내려주세요" })).toBeVisible();
  await page.getByRole("button", { name: "안내 확인" }).click();
  await expect(page.getByRole("group", { name: "로봇 방향 명령" })).toBeVisible();
  await page.getByRole("button", { name: "우회전" }).click();
  await expect(page.getByText("우회전 명령을 전달했어요.")).toBeVisible();
  await page.getByRole("button", { name: "음성으로 말하기" }).click();
  await expect(page.getByText("들은 말:")).toContainText("앞으로 가");
  await expect(page.getByText("전진 명령을 전달했어요.")).toBeVisible();
  expect(api.calls).toEqual([
    { path: "/.netlify/functions/voice-command", body: { source: "touch", command: "우회전" } },
    { path: "/.netlify/functions/voice-command", body: { source: "speech", transcript: "앞으로 가" } },
  ]);
});
