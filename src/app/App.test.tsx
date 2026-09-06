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
