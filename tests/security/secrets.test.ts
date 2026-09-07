import { execFileSync } from "node:child_process";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { expect, test } from "vitest";
import { formatFindings, scanEntries, scanRepository } from "./secret-scanner";

const geminiPrefix = "AI" + "za";
const gasPrefix = "A" + "Q.";
const viteGemini = "VITE_" + "GEMINI";
const geminiName = "GEMINI" + "_API_KEY";
const voiceGasTokenName = "VOICE" + "_GAS_TOKEN";
const emotionGasTokenName = "EMOTION" + "_GAS_TOKEN";
const emotionGasUrlName = "EMOTION" + "_GAS_URL";
const genericPrefixes = ["sk", "rk", "pk"].map((prefix) => `${prefix}_`);
const syntheticGemini = `${geminiPrefix}${"x".repeat(24)}`;
const syntheticGasToken = `${gasPrefix}${"y".repeat(24)}`;

test("allows empty example assignments line-by-line while still detecting a later nonempty assignment", () => {
  const findings = scanEntries([{
    file: ".env.example",
    content: [
      `${geminiName}=`,
      `${emotionGasTokenName}=`,
      `${geminiName}=${syntheticGemini}`,
    ].join("\n"),
  }]);

  expect(findings).toEqual([
    { file: ".env.example", rule: "google-api-key" },
    { file: ".env.example", rule: "gemini-assignment" },
    { file: ".env.example", rule: "sensitive-assignment" },
  ]);
});

test("allows an empty sensitive assignment only on an otherwise-empty .env.example line", () => {
  const findings = scanEntries([
    { file: "config/local.env", content: `${geminiName}=` },
    { file: ".env.example", content: `${geminiName}=\n${geminiName}=${syntheticGemini}` },
  ]);

  expect(findings).toEqual([
    { file: "config/local.env", rule: "empty-sensitive-assignment" },
    { file: ".env.example", rule: "google-api-key" },
    { file: ".env.example", rule: "gemini-assignment" },
    { file: ".env.example", rule: "sensitive-assignment" },
  ]);
});

test("rejects comments, shell prefixes, and values around the .env.example empty-assignment exception", () => {
  const findings = scanEntries([{
    file: ".env.example",
    content: [
      `${geminiName}= # placeholder`,
      `echo ${geminiName}=`,
      `${emotionGasUrlName}=https://example.test/endpoint`,
    ].join("\n"),
  }]);

  expect(findings).toEqual([
    { file: ".env.example", rule: "invalid-sensitive-assignment" },
    { file: ".env.example", rule: "invalid-sensitive-assignment" },
    { file: ".env.example", rule: "sensitive-assignment" },
  ]);
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

test.each(genericPrefixes)("detects generic key-like prefix %s", (prefix) => {
  const credential = `${prefix}${"z".repeat(24)}`;
  const findings = scanEntries([{ file: "tests/e2e/controlled-credential.spec.ts", content: credential }]);

  expect(findings).toEqual([{ file: "tests/e2e/controlled-credential.spec.ts", rule: "generic-key" }]);
  expect(formatFindings(findings)).not.toContain(credential);
});

test("scans tracked source candidates without requiring a pre-existing production build", () => {
  const result = scanRepository(process.cwd());

  expect(result.findings, formatFindings(result.findings) || undefined).toEqual([]);
  expect(typeof result.scannedDist).toBe("boolean");
});

test("discovers a generated credential in a tracked test-spec fixture", () => {
  const root = mkdtempSync(join(tmpdir(), "robot-secret-scan-"));
  const credential = `${genericPrefixes[0]}${"q".repeat(24)}`;
  const fixture = join(root, "tests", "e2e", "tracked-credential.spec.ts");
  try {
    mkdirSync(join(root, "tests", "e2e"), { recursive: true });
    writeFileSync(fixture, `const credential = \"${credential}\";`, "utf8");
    execFileSync("git", ["init", "--quiet"], { cwd: root });
    execFileSync("git", ["add", "tests/e2e/tracked-credential.spec.ts"], { cwd: root });

    const findings = scanRepository(root).findings;
    expect(findings).toEqual([{ file: "tests/e2e/tracked-credential.spec.ts", rule: "generic-key" }]);
    expect(formatFindings(findings)).not.toContain(credential);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("formats failures with only a relative path and rule name", () => {
  const findings = scanEntries([{ file: "src/controlled-fixture.ts", content: syntheticGemini }]);
  const message = formatFindings(findings);

  expect(message).toBe("src/controlled-fixture.ts: google-api-key");
  expect(message).not.toContain(syntheticGemini);
});
