const SPREADSHEET_ID = "1-Kfl3N5dInSFagkL8GaCzyBGHmuUgO2NwQtfx2jDA1M";
const SHEET_NAME = "음성명령 지게차";
const TARGET_RANGE = "A2";
const ALLOWED_VALUES = Object.freeze(["전진", "후진", "좌회전", "우회전"]);

function doGet() {
  return json_({ ok: true, service: "voice" });
}

function doPost(e) {
  var body = parseBody_(e);
  if (!body) {
    return json_({ ok: false, code: "INVALID_REQUEST" });
  }

  var properties = PropertiesService.getScriptProperties();
  var expectedToken = properties.getProperty("API_TOKEN");
  if (!expectedToken || body.token !== expectedToken) {
    return json_({ ok: false, code: "UNAUTHORIZED" });
  }
  if (
    typeof body.requestId !== "string"
    || body.requestId.trim() === ""
    || ALLOWED_VALUES.indexOf(body.value) === -1
  ) {
    return json_({ ok: false, code: "INVALID_REQUEST" });
  }

  var lock = LockService.getScriptLock();
  lock.waitLock(5000);
  try {
    if (properties.getProperty("LAST_REQUEST_ID") === body.requestId) {
      return json_({ ok: true, duplicate: true });
    }

    SpreadsheetApp
      .openById(SPREADSHEET_ID)
      .getSheetByName(SHEET_NAME)
      .getRange(TARGET_RANGE)
      .setValue(body.value);
    properties.setProperty("LAST_REQUEST_ID", body.requestId);
    return json_({ ok: true, duplicate: false });
  } finally {
    lock.releaseLock();
  }
}

function parseBody_(e) {
  if (!e || !e.postData || typeof e.postData.contents !== "string") {
    return null;
  }

  try {
    var parsed = JSON.parse(e.postData.contents);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : null;
  } catch (_error) {
    return null;
  }
}

function json_(body) {
  return ContentService
    .createTextOutput(JSON.stringify(body))
    .setMimeType(ContentService.MimeType.JSON);
}
