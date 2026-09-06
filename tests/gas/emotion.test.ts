import { describe, expect, it } from "vitest";
import {
  createGasServices,
  eventFor,
  loadGas,
  malformedEvent,
  readGasJson
} from "./harness";

const SCRIPT = "apps-script/emotion/Code.gs";

describe("emotion GAS writer", () => {
  it("writes an allowed emotion to the exact spreadsheet A2 range under a lock", () => {
    const services = createGasServices();
    const gas = loadGas(SCRIPT, services);

    const response = gas.doPost(eventFor({
      token: "secret",
      requestId: "req-1",
      value: "행복"
    }));

    expect(services.getScriptLock).toHaveBeenCalledOnce();
    expect(services.waitLock).toHaveBeenCalledWith(5000);
    expect(services.openById).toHaveBeenCalledWith(
      "1zkaiqCPlOu_3sg2FZEavDRZt1R88G-aVuiefS7puj0g"
    );
    expect(services.getSheetByName).toHaveBeenCalledWith("시트1");
    expect(services.getRange).toHaveBeenCalledWith("A2");
    expect(services.setValue).toHaveBeenCalledWith("행복");
    expect(services.setProperty).toHaveBeenCalledWith("LAST_REQUEST_ID", "req-1");
    expect(services.releaseLock).toHaveBeenCalledOnce();
    expect(readGasJson(response)).toEqual({ ok: true, duplicate: false });
  });

  it("deduplicates the last request ID without writing again", () => {
    const services = createGasServices({
      API_TOKEN: "secret",
      LAST_REQUEST_ID: "req-repeat"
    });
    const gas = loadGas(SCRIPT, services);

    const response = gas.doPost(eventFor({
      token: "secret",
      requestId: "req-repeat",
      value: "슬픔"
    }));

    expect(services.waitLock).toHaveBeenCalledWith(5000);
    expect(services.setValue).not.toHaveBeenCalled();
    expect(services.setProperty).not.toHaveBeenCalled();
    expect(services.releaseLock).toHaveBeenCalledOnce();
    expect(readGasJson(response)).toEqual({ ok: true, duplicate: true });
  });

  it("rejects a bad token before acquiring the lock or writing", () => {
    const services = createGasServices();
    const gas = loadGas(SCRIPT, services);

    const response = gas.doPost(eventFor({
      token: "wrong",
      requestId: "req-2",
      value: "보통"
    }));

    expect(services.getScriptLock).not.toHaveBeenCalled();
    expect(services.setValue).not.toHaveBeenCalled();
    expect(readGasJson(response)).toEqual({ ok: false, code: "UNAUTHORIZED" });
  });

  it.each([
    [{ token: "secret", requestId: "", value: "행복" }],
    [{ token: "secret", requestId: 42, value: "행복" }],
    [{ token: "secret", requestId: "req-3", value: "신남" }]
  ])("rejects an invalid request without writing", (body) => {
    const services = createGasServices();
    const gas = loadGas(SCRIPT, services);

    const response = gas.doPost(eventFor(body));

    expect(services.setValue).not.toHaveBeenCalled();
    expect(readGasJson(response)).toEqual({ ok: false, code: "INVALID_REQUEST" });
  });

  it("returns a safe invalid-request response for malformed JSON", () => {
    const services = createGasServices();
    const gas = loadGas(SCRIPT, services);

    const response = gas.doPost(malformedEvent());

    expect(readGasJson(response)).toEqual({
      ok: false,
      code: "INVALID_REQUEST"
    });
    expect(services.setValue).not.toHaveBeenCalled();
  });

  it("returns only public emotion health metadata", () => {
    const gas = loadGas(SCRIPT, createGasServices());

    expect(readGasJson(gas.doGet())).toEqual({ ok: true, service: "emotion" });
  });
});
