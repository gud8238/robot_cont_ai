import { describe, expect, it } from "vitest";
import { createGasServices, eventFor, loadGas, readGasJson } from "./harness";

const SCRIPT = "apps-script/voice/Code.gs";

describe("voice GAS writer", () => {
  it.each(["전진", "후진", "좌회전", "우회전"])(
    "writes the allowed %s command to the exact spreadsheet A2 range",
    (value) => {
      const services = createGasServices();
      const gas = loadGas(SCRIPT, services);

      const response = gas.doPost(eventFor({ token: "secret", requestId: `req-${value}`, value }));

      expect(services.openById).toHaveBeenCalledWith(
        "1-Kfl3N5dInSFagkL8GaCzyBGHmuUgO2NwQtfx2jDA1M"
      );
      expect(services.getSheetByName).toHaveBeenCalledWith("음성명령 지게차");
      expect(services.getRange).toHaveBeenCalledWith("A2");
      expect(services.setValue).toHaveBeenCalledWith(value);
      expect(services.releaseLock).toHaveBeenCalledOnce();
      expect(readGasJson(response)).toEqual({ ok: true, duplicate: false });
    }
  );

  it("does not write an unsupported voice command", () => {
    const services = createGasServices();
    const gas = loadGas(SCRIPT, services);

    const response = gas.doPost(eventFor({
      token: "secret",
      requestId: "req-2",
      value: "정지"
    }));

    expect(services.setValue).not.toHaveBeenCalled();
    expect(readGasJson(response)).toEqual({ ok: false, code: "INVALID_REQUEST" });
  });

  it.each(["", 42])("rejects the invalid request ID %j without writing", (requestId) => {
    const services = createGasServices();
    const gas = loadGas(SCRIPT, services);

    const response = gas.doPost(eventFor({ token: "secret", requestId, value: "전진" }));

    expect(services.setValue).not.toHaveBeenCalled();
    expect(readGasJson(response)).toEqual({ ok: false, code: "INVALID_REQUEST" });
  });

  it("deduplicates the last command request ID", () => {
    const services = createGasServices({
      API_TOKEN: "secret",
      LAST_REQUEST_ID: "req-repeat"
    });
    const gas = loadGas(SCRIPT, services);

    const response = gas.doPost(eventFor({
      token: "secret",
      requestId: "req-repeat",
      value: "전진"
    }));

    expect(services.setValue).not.toHaveBeenCalled();
    expect(services.releaseLock).toHaveBeenCalledOnce();
    expect(readGasJson(response)).toEqual({ ok: true, duplicate: true });
  });

  it("rejects a bad token without writing", () => {
    const services = createGasServices();
    const gas = loadGas(SCRIPT, services);

    const response = gas.doPost(eventFor({
      token: "wrong",
      requestId: "req-3",
      value: "전진"
    }));

    expect(services.setValue).not.toHaveBeenCalled();
    expect(readGasJson(response)).toEqual({ ok: false, code: "UNAUTHORIZED" });
  });

  it("returns only public voice health metadata", () => {
    const gas = loadGas(SCRIPT, createGasServices());

    expect(readGasJson(gas.doGet())).toEqual({ ok: true, service: "voice" });
  });
});
