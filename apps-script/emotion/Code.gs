const SPREADSHEET_ID = "1zkaiqCPlOu_3sg2FZEavDRZt1R88G-aVuiefS7puj0g";
const SHEET_NAME = "시트1";
const TARGET_RANGE = "A2";
const ALLOWED_VALUES = Object.freeze(["행복", "슬픔", "보통", "화남"]);

function doGet() {
  return json_({ ok: true, service: "emotion" });
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
