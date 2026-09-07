import { readdirSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";

function listFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    return entry.isDirectory() ? listFiles(path) : [path];
  });
}

describe("Netlify function deployment surface", () => {
  it("contains production entrypoints and shared modules, but no test entrypoints", () => {
    const directory = join(process.cwd(), "netlify", "functions");
    const files = listFiles(directory).map((path) => relative(directory, path).replaceAll("\\", "/"));

    expect(files.filter((path) => path.endsWith(".test.ts"))).toEqual([]);
    expect(files.filter((path) => !path.startsWith("_shared/")).sort()).toEqual([
      "emotion-save.ts",
      "emotion-turn.ts",
      "voice-command.ts",
    ]);
  });
});
