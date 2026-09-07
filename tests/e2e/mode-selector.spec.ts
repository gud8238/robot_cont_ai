import { expect, test } from "@playwright/test";
import { installMockApi } from "../fixtures/mock-api";

test("lets a visitor choose either labeled robot journey", async ({ page }) => {
  await installMockApi(page);
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1, name: "오늘은 어떤 로봇과 함께할까요?" })).toBeVisible();
  await expect(page.getByRole("img", { name: "웃으며 두 팔을 펼친 하얀 로봇 친구" })).toBeVisible();
  await page.getByRole("button", { name: "감정인식로봇 시작" }).click();
  await expect(page.getByRole("heading", { level: 1, name: "오늘의 기분에 대해 함께 알아봅시다" })).toBeVisible();
  await page.getByRole("button", { name: "처음으로" }).click();
  await page.getByRole("button", { name: "음성명령로봇 시작" }).click();
  await expect(page.getByRole("heading", { level: 1, name: "음성명령을 내려주세요" })).toBeVisible();
  await expect(page.getByRole("button", { name: "안내 확인" })).toBeVisible();
});
