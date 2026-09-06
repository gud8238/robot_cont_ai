import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { createContext, runInContext } from "node:vm";
import { vi, type Mock } from "vitest";

type GasEvent = {
  readonly postData?: {
    readonly contents: string;
  };
};

type GasTextOutput = {
  getContent(): string;
  setMimeType(mimeType: string): GasTextOutput;
};

type GasExports = {
  doGet(event?: GasEvent): GasTextOutput;
  doPost(event?: GasEvent): GasTextOutput;
};

export type GasServices = {
  readonly openById: Mock;
  readonly getSheetByName: Mock;
  readonly getRange: Mock;
  readonly setValue: Mock;
  readonly getScriptLock: Mock;
  readonly waitLock: Mock;
  readonly releaseLock: Mock;
  readonly getProperty: Mock;
  readonly setProperty: Mock;
  readonly properties: Map<string, string>;
};

export function createGasServices(
  initialProperties: Record<string, string> = { API_TOKEN: "secret" }
): GasServices {
  const properties = new Map(Object.entries(initialProperties));
  const setValue = vi.fn();
  const getRange = vi.fn(() => ({ setValue }));
  const getSheetByName = vi.fn(() => ({ getRange }));
  const openById = vi.fn(() => ({ getSheetByName }));
  const waitLock = vi.fn();
  const releaseLock = vi.fn();
  const getScriptLock = vi.fn(() => ({ waitLock, releaseLock }));
  const getProperty = vi.fn((key: string) => properties.get(key) ?? null);
  const setProperty = vi.fn((key: string, value: string) => {
    properties.set(key, value);
  });

  return {
    openById,
    getSheetByName,
    getRange,
    setValue,
    getScriptLock,
    waitLock,
    releaseLock,
    getProperty,
    setProperty,
    properties
  };
}

export function loadGas(relativePath: string, services: GasServices): GasExports {
  const scriptProperties = {
    getProperty: services.getProperty,
    setProperty: services.setProperty
  };
  const context = createContext({
    JSON,
    PropertiesService: {
      getScriptProperties: () => scriptProperties
    },
    SpreadsheetApp: {
      openById: services.openById
    },
    LockService: {
      getScriptLock: services.getScriptLock
    },
    ContentService: {
      MimeType: { JSON: "application/json" },
      createTextOutput(content: string): GasTextOutput {
        return {
          getContent: () => content,
          setMimeType() {
            return this;
          }
        };
      }
    }
  });

  const source = readFileSync(resolve(process.cwd(), relativePath), "utf8");
  runInContext(source, context, { filename: relativePath });

  return {
    doGet: context.doGet as GasExports["doGet"],
    doPost: context.doPost as GasExports["doPost"]
  };
}

export function eventFor(body: unknown): GasEvent {
  return { postData: { contents: JSON.stringify(body) } };
}

export function malformedEvent(contents = "{"): GasEvent {
  return { postData: { contents } };
}

export function readGasJson(response: GasTextOutput): unknown {
  return JSON.parse(response.getContent());
}
