import { execFileSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";

export type ScanEntry = {
  readonly file: string;
  readonly content: string;
};

export type SecretFinding = {
  readonly file: string;
  readonly rule: string;
};

const geminiPrefix = "AI" + "za";
const gasPrefix = "A" + "Q\\.";
const viteGemini = "VITE_" + "GEMINI";
const geminiName = "GEMINI" + "_API_KEY";
const gasTokenNames = "(?:EMOTION|VOICE)_GAS_TOKEN";
const assignedValue = "(?:[\\\"'][^\\\"'\\r\\n]+[\\\"']|[^\\s#},]+)";
const objectValue = "[\\\"'][^\\\"'\\r\\n]+[\\\"']";

const rules = [
  { name: "google-api-key", pattern: new RegExp(geminiPrefix) },
  { name: "gas-token", pattern: new RegExp(`${gasPrefix}[A-Za-z0-9_-]+`) },
  { name: "gemini-assignment", pattern: new RegExp(`${geminiName}[\\t ]*(?:=[\\t ]*${assignedValue}|:[\\t ]*${objectValue})`) },
  { name: "gas-token-assignment", pattern: new RegExp(`${gasTokenNames}[\\t ]*(?:=[\\t ]*${assignedValue}|:[\\t ]*${objectValue})`) },
  { name: "client-gemini-variable", pattern: new RegExp(viteGemini) },
] as const;

function trackedTextFiles(root: string): string[] {
  return execFileSync("git", ["ls-files", "-z"], { cwd: root, encoding: "buffer" })
    .toString("utf8")
    .split("\0")
    .filter(Boolean)
    .filter((file) => /^(?:src|netlify|apps-script|tests|public)\//.test(file) || [".env.example", "index.html", "package.json", "package-lock.json", "vite.config.ts", "playwright.config.ts"].includes(file))
    .filter((file) => !/(?:^|\/)[^/]+\.(?:test|spec)\.[cm]?[jt]sx?$/.test(file))
    .filter((file) => !/\.(?:webp|png|jpe?g|gif|ico|zip|pdf)$/i.test(file));
}

function filesUnder(directory: string): string[] {
  if (!existsSync(directory)) return [];
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const target = join(directory, entry.name);
    return entry.isDirectory() ? filesUnder(target) : [target];
  });
}

export function scanEntries(entries: readonly ScanEntry[]): SecretFinding[] {
  return entries.flatMap(({ file, content }) => rules
    .filter(({ pattern }) => pattern.test(content))
    .map(({ name }) => ({ file, rule: name })));
}

export function formatFindings(findings: readonly SecretFinding[]): string {
  return findings.map(({ file, rule }) => `${file}: ${rule}`).join(", ");
}

export function scanRepository(root: string): { readonly findings: SecretFinding[]; readonly scannedDist: boolean } {
  const dist = join(root, "dist");
  const distFiles = filesUnder(dist);
  const files = [...trackedTextFiles(root), ...distFiles.map((file) => relative(root, file))];
  const entries = files.map((file) => ({ file, content: readFileSync(join(root, file), "utf8") }));
  return { findings: scanEntries(entries), scannedDist: distFiles.length > 0 };
}
