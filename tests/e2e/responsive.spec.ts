import { expect, test } from "@playwright/test";
import { installMockApi } from "../fixtures/mock-api";

const viewports = [
  { name: "laptop", width: 1440, height: 900 },
  { name: "tablet-landscape", width: 1024, height: 768 },
  { name: "tablet-portrait", width: 768, height: 1024 },
  { name: "small-screen", width: 390, height: 844 },
] as const;

for (const viewport of viewports) {
  test.describe(viewport.name, () => {
    test.use({ viewport });
    test("keeps both robot control surfaces visible without horizontal overflow", async ({ page }) => {
      await installMockApi(page);
      await page.goto("/");
      await expect(page.getByRole("button", { name: "감정인식로봇 시작" })).toBeVisible();
      await expect(page.getByRole("button", { name: "음성명령로봇 시작" })).toBeVisible();
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
      await page.getByRole("button", { name: "감정인식로봇 시작" }).click();
      await page.getByRole("textbox", { name: "이름", exact: true }).fill("하늘");
      await page.getByRole("spinbutton", { name: "나이" }).fill("10");
      await page.getByRole("textbox", { name: "불러줬으면 하는 이름" }).fill("하늘아");
      await page.getByRole("button", { name: "대화 시작" }).click();
      await expect(page.getByRole("button", { name: "음성으로 말하기" })).toBeVisible();
      await expect(page.getByRole("textbox", { name: "직접 입력" })).toBeVisible();
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
      await page.getByRole("button", { name: "처음으로" }).click();
      await page.getByRole("button", { name: "음성명령로봇 시작" }).click();
      await page.getByRole("button", { name: "안내 확인" }).click();
      const directions = page.getByRole("group", { name: "로봇 방향 명령" }).getByRole("button");
      await expect(directions).toHaveCount(4);
      for (const direction of await directions.all()) {
        await direction.scrollIntoViewIfNeeded();
        await expect(direction).toBeVisible();
      }
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
      if (viewport.width >= 768) {
        for (const direction of await directions.all()) {
          const box = await direction.boundingBox();
          expect(box).not.toBeNull();
          expect(box?.width).toBeGreaterThanOrEqual(64);
          expect(box?.height).toBeGreaterThanOrEqual(64);
        }
      }
    });
  });
}

test.describe("mobile emotion result", () => {
  test.use({ viewport: { width: 592, height: 1280 } });

  test("keeps the compact emotion result robot within 320 pixels", async ({ page }) => {
    await installMockApi(page);
    await page.goto("/");
    await page.getByRole("button", { name: "감정인식로봇 시작" }).click();
    await page.getByRole("textbox", { name: "이름", exact: true }).fill("하늘");
    await page.getByRole("spinbutton", { name: "나이" }).fill("10");
    await page.getByRole("textbox", { name: "불러줬으면 하는 이름" }).fill("하늘아");
    await page.getByRole("button", { name: "대화 시작" }).click();

    const textBox = page.getByRole("textbox", { name: "직접 입력" });
    for (const message of [
      "친구와 공원에서 신나게 놀았어요.",
      "함께 웃었던 순간이 가장 기억나요.",
      "생각할수록 기분이 좋아져요."
    ]) {
      await textBox.fill(message);
      await page.getByRole("button", { name: "보내기" }).click();
    }

    const resultImage = page.getByRole("img", { name: "행복한 표정의 로봇" });
    await expect(resultImage).toBeVisible();
    const box = await resultImage.boundingBox();
    expect(box).not.toBeNull();
    expect(box!.width).toBeLessThanOrEqual(320);
    expect(box!.height).toBeLessThanOrEqual(320);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  });
});
