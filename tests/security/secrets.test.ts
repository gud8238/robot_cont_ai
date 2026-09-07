import { expect, test } from "vitest";
import { formatFindings, scanEntries, scanRepository } from "./secret-scanner";

const geminiPrefix = "AI" + "za";
const gasPrefix = "A" + "Q.";
const viteGemini = "VITE_" + "GEMINI";
const geminiName = "GEMINI" + "_API_KEY";
const voiceGasTokenName = "VOICE" + "_GAS_TOKEN";
const syntheticGemini = `${geminiPrefix}${"x".repeat(24)}`;
const syntheticGasToken = `${gasPrefix}${"y".repeat(24)}`;

test("allows empty example assignments line-by-line while still detecting a later nonempty assignment", () => {
  const findings = scanEntries([{
    file: ".env.example",
    content: [
      `${geminiName}=`,
      "EMOTION_GAS_TOKEN=",
      `${geminiName}=${syntheticGemini}`,
    ].join("\n"),
  }]);

  expect(findings).toEqual([{ file: ".env.example", rule: "google-api-key" }, { file: ".env.example", rule: "gemini-assignment" }]);
});

test.each([
  ["bare Gemini prefix", `const marker = \"${geminiPrefix}\";`, "google-api-key"],
  ["AQ-style GAS token", `const token = \"${syntheticGasToken}\";`, "gas-token"],
  ["object-style Gemini assignment", `const config = { ${geminiName}: \"${syntheticGemini}\" };`, "google-api-key"],
  ["object-style GAS assignment", `const config = { ${voiceGasTokenName}: \"value\" };`, "gas-token-assignment"],
  ["assignment-style Gemini value", `${geminiName}=${syntheticGemini}`, "google-api-key"],
  ["client Gemini variable", `const name = \"${viteGemini}\";`, "client-gemini-variable"],
] as const)("detects %s without exposing the matched value", (_label, content, rule) => {
  const findings = scanEntries([{ file: "src/controlled-fixture.ts", content }]);

  expect(findings).toContainEqual({ file: "src/controlled-fixture.ts", rule });
  expect(JSON.stringify(findings)).not.toContain(syntheticGemini);
  expect(JSON.stringify(findings)).not.toContain(syntheticGasToken);
});

test("scans tracked source candidates without requiring a pre-existing production build", () => {
  const result = scanRepository(process.cwd());

  expect(result.findings, formatFindings(result.findings) || undefined).toEqual([]);
  expect(typeof result.scannedDist).toBe("boolean");
});

test("formats failures with only a relative path and rule name", () => {
  const findings = scanEntries([{ file: "src/controlled-fixture.ts", content: syntheticGemini }]);
  const message = formatFindings(findings);

  expect(message).toBe("src/controlled-fixture.ts: google-api-key");
  expect(message).not.toContain(syntheticGemini);
});
