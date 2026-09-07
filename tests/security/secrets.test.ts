import { execFileSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { expect, test } from "vitest";

const root = process.cwd();
const viteGemini = "VITE_" + "GEMINI";
const aiKeyPrefix = "AI" + "za";

type Rule = { readonly name: string; readonly pattern: RegExp };

const rules: readonly Rule[] = [
  { name: "google-api-key", pattern: new RegExp(`${aiKeyPrefix}[A-Za-z0-9_-]{20,}`) },
  { name: "generic-secret-key", pattern: /(?:sk|rk|pk)_[A-Za-z0-9_-]{20,}/ },
  { name: "gemini-value", pattern: /GEMINI_API_KEY\s*=\s*[^\s#]+/ },
  { name: "gas-token-value", pattern: /(?:EMOTION|VOICE)_GAS_TOKEN\s*=\s*[^\s#]+/ },
  { name: "client-gemini-variable", pattern: new RegExp(viteGemini) },
];

function trackedTextFiles(): string[] {
  return execFileSync("git", ["ls-files", "-z"], { cwd: root, encoding: "buffer" })
    .toString("utf8")
    .split("\0")
    .filter(Boolean)
    .filter((file) => /^(?:src|netlify|apps-script|tests|public)\//.test(file) || [".env.example", "index.html", "package.json", "package-lock.json", "vite.config.ts", "playwright.config.ts"].includes(file))
    .filter((file) => !/\.(?:webp|png|jpe?g|gif|ico|zip|pdf)$/i.test(file));
}

function filesUnder(directory: string): string[] {
  if (!existsSync(directory)) return [];
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const target = join(directory, entry.name);
    return entry.isDirectory() ? filesUnder(target) : [target];
  });
}

function isExplicitlyEmptyExample(file: string, content: string): boolean {
  return file === ".env.example" && /^\s*(?:GEMINI_API_KEY|EMOTION_GAS_URL|VOICE_GAS_URL|EMOTION_GAS_TOKEN|VOICE_GAS_TOKEN)=\s*$/m.test(content);
}

test("keeps tracked sources and the production build free of client and server secrets", () => {
  const dist = join(root, "dist");
  expect(existsSync(dist), "Run npm run build before the secret scan.").toBe(true);
  const files = [...trackedTextFiles(), ...filesUnder(dist).filter((file) => statSync(file).isFile()).map((file) => relative(root, file))];
  const findings: string[] = [];
  for (const file of files) {
    const content = readFileSync(join(root, file), "utf8");
    for (const rule of rules) {
      if (rule.pattern.test(content) && !isExplicitlyEmptyExample(file, content)) findings.push(`${file}: ${rule.name}`);
    }
  }
  expect(findings, findings.length ? `Secret scan findings: ${findings.join(", ")}` : undefined).toEqual([]);
});
