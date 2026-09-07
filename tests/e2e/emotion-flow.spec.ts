import { expect, test } from "@playwright/test";
import { installDeterministicSpeech, installMockApi } from "../fixtures/mock-api";

test("sends the bounded profile and three conversation turns before showing the saved emotion", async ({ page }) => {
  await installDeterministicSpeech(page);
  const api = await installMockApi(page);
  await page.goto("/");
  await page.getByRole("button", { name: "감정인식로봇 시작" }).click();
  await page.getByRole("textbox", { name: "이름", exact: true }).fill("하늘");
  await page.getByRole("spinbutton", { name: "나이" }).fill("10");
  await page.getByRole("textbox", { name: "불러줬으면 하는 이름" }).fill("하늘아");
  await page.getByRole("button", { name: "대화 시작" }).click();

  const textBox = page.getByRole("textbox", { name: "직접 입력" });
  await textBox.fill("친구와 공원에서 신나게 놀았어요.");
  await page.getByRole("button", { name: "보내기" }).click();
  await expect(page.getByText("첫 번째 이야기를 들으니 즐거웠어요. 또 어떤 일이 기억나요?")).toBeVisible();
  await textBox.fill("함께 웃었던 순간이 가장 기억나요.");
  await page.getByRole("button", { name: "보내기" }).click();
  await expect(page.getByText("친구와 함께한 시간이 소중했군요. 마지막으로 지금 마음은 어떤가요?")).toBeVisible();
  await textBox.fill("생각할수록 기분이 좋아져요.");
  await page.getByRole("button", { name: "보내기" }).click();
  await expect(page.getByRole("heading", { level: 1, name: "행복" })).toBeVisible();
  await expect(page.getByText("감정 결과를 시트에 전달했어요.")).toBeVisible();
  await expect(page.getByRole("img", { name: "행복한 표정의 로봇" })).toBeVisible();

  expect(api.calls).toEqual([
    { path: "/.netlify/functions/emotion-turn", body: { profile: { name: "하늘", age: 10, honorific: "하늘아" }, history: [{ role: "user", text: "친구와 공원에서 신나게 놀았어요." }] } },
    { path: "/.netlify/functions/emotion-turn", body: { profile: { name: "하늘", age: 10, honorific: "하늘아" }, history: [
      { role: "user", text: "친구와 공원에서 신나게 놀았어요." },
      { role: "assistant", text: "첫 번째 이야기를 들으니 즐거웠어요. 또 어떤 일이 기억나요?" },
      { role: "user", text: "함께 웃었던 순간이 가장 기억나요." },
    ] } },
    { path: "/.netlify/functions/emotion-turn", body: { profile: { name: "하늘", age: 10, honorific: "하늘아" }, history: [
      { role: "user", text: "친구와 공원에서 신나게 놀았어요." },
      { role: "assistant", text: "첫 번째 이야기를 들으니 즐거웠어요. 또 어떤 일이 기억나요?" },
      { role: "user", text: "함께 웃었던 순간이 가장 기억나요." },
      { role: "assistant", text: "친구와 함께한 시간이 소중했군요. 마지막으로 지금 마음은 어떤가요?" },
      { role: "user", text: "생각할수록 기분이 좋아져요." },
    ] } },
  ]);
});
