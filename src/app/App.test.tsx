import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it } from "vitest";
import { App } from "./App";

afterEach(cleanup);

describe("App", () => {
  it("offers both robot modes", () => {
    render(<App />);
    expect(screen.getByRole("button", { name: /감정인식로봇/ })).toBeVisible();
    expect(screen.getByRole("button", { name: /음성명령로봇/ })).toBeVisible();
  });

  it("presents the Robot Link mode selector", () => {
    render(<App />);
    expect(screen.getByText("Robot Link")).toBeVisible();
    expect(screen.getByRole("heading", { level: 1, name: "로봇 모드를 선택하세요" })).toBeVisible();
  });

  it("introduces the robot with a meaningful accessible image", () => {
    render(<App />);
    expect(screen.getByRole("img", { name: /웃으며 손을 흔드는/ })).toBeVisible();
    expect(screen.getByRole("heading", { level: 1, name: /로봇 모드/ })).toBeVisible();
  });

  it.each([
    { button: "감정인식로봇 시작", heading: /오늘의 기분/ },
    { button: "음성명령로봇 시작", heading: /음성명령을 내려주세요/ },
  ])("opens $button and returns home", async ({ button, heading }) => {
    const user = userEvent.setup();
    render(<App />);

    await user.click(screen.getByRole("button", { name: button }));
    expect(screen.getByRole("heading", { level: 1, name: heading })).toBeVisible();
    expect(screen.getByRole("heading", { level: 1, name: heading })).toHaveFocus();
    expect(screen.queryByRole("button", { name: button })).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /처음으로/ }));
    expect(screen.getByRole("heading", { level: 1, name: /로봇 모드/ })).toBeVisible();
    expect(screen.getByRole("button", { name: button })).toHaveFocus();
  });

  it("lets keyboard users choose either mode", async () => {
    const user = userEvent.setup();
    render(<App />);

    await user.tab();
    expect(screen.getByRole("button", { name: "감정인식로봇 시작" })).toHaveFocus();
    await user.tab();
    expect(screen.getByRole("button", { name: "음성명령로봇 시작" })).toHaveFocus();
    await user.keyboard("{Enter}");
    expect(screen.getByRole("heading", { name: /음성명령을 내려주세요/ })).toBeVisible();
  });

  it("clips decorative orbit arcs inside the hero at narrow widths", () => {
    render(<App />);
    const hero = screen.getByRole("img", { name: /웃으며 손을 흔드는/ }).closest(".robot-hero");

    expect(hero).not.toBeNull();
    expect((hero as HTMLElement).style.overflow).toBe("hidden");
  });

  it("opens the voice introduction before revealing command controls", async () => {
    const user = userEvent.setup();
    render(<App />);

    await user.click(screen.getByRole("button", { name: "음성명령로봇 시작" }));

    expect(screen.getByRole("button", { name: "안내 확인" })).toBeVisible();
    expect(screen.queryByRole("group", { name: "로봇 방향 명령" })).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "안내 확인" }));
    expect(screen.getByRole("group", { name: "로봇 방향 명령" })).toBeVisible();
  });
});
