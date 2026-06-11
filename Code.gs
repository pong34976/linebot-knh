const LINE_REPLY_URL = 'https://api.line.me/v2/bot/message/reply';
const ACTIVITY_SPREADSHEET_ID = '1qbX5ENwvxPVe6SIduBQk50eaBNuvKMQwO8qucM-AjJY';
const ACTIVITY_SHEET_NAME = 'Activity พงศ์พล';
const ACTIVITY_TIME_SLOTS = [
  '8:00 - 9:00',
  '9:00 - 10:00',
  '10:00 - 11:00',
  '11:00 - 12:00',
  '12:00 - 13:00',
  '13:00 - 14:00',
  '14:00 - 15:00',
  '15:00 - 16:00'
];

function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu('Activity Tools')
    .addItem('สร้างข้อมูลวันพรุ่งนี้', 'createNextActivityDateManual')
    .addItem('ติดตั้งทริกเกอร์ 20:00', 'installActivityTriggerManual')
    .addToUi();
}

function createNextActivityDateManual() {
  const ui = SpreadsheetApp.getUi();
  const answer = ui.alert(
    'สร้างข้อมูลวันพรุ่งนี้',
    'ต้องการสร้างข้อมูลวันพรุ่งนี้ในชีต Activity พงศ์พลหรือไม่?',
    ui.ButtonSet.YES_NO
  );
  if (answer !== ui.Button.YES) return;

  try {
    const result = createNextActivityDate();
    ui.alert(result.message);
  } catch (error) {
    ui.alert('สร้างข้อมูลไม่สำเร็จ: ' + error.message);
    throw error;
  }
}

function installActivityTriggerManual() {
  try {
    installActivityTrigger();
    SpreadsheetApp.getUi().alert('ติดตั้งทริกเกอร์ใกล้เวลา 20:00 เรียบร้อยแล้ว');
  } catch (error) {
    SpreadsheetApp.getUi().alert('ติดตั้งทริกเกอร์ไม่สำเร็จ: ' + error.message);
    throw error;
  }
}

/** Run once to generate a webhook secret, then set the token in Script Properties. */
function setup() {
  const properties = PropertiesService.getScriptProperties();
  if (!properties.getProperty('WEBHOOK_SECRET')) {
    properties.setProperty('WEBHOOK_SECRET', Utilities.getUuid().replace(/-/g, ''));
  }

  console.log('Setup complete. WEBHOOK_SECRET: ' +
    properties.getProperty('WEBHOOK_SECRET'));
}

function doGet() {
  return jsonResponse_({ ok: true, service: 'LINE ID Bot' });
}

function doPost(e) {
  try {
    const properties = PropertiesService.getScriptProperties();
    const expectedSecret = properties.getProperty('WEBHOOK_SECRET');

    if (!expectedSecret || !e || e.parameter.key !== expectedSecret) {
      return jsonResponse_({ ok: false, error: 'Unauthorized' });
    }

    const payload = JSON.parse(e.postData.contents || '{}');
    (payload.events || []).forEach(handleEvent_);

    return jsonResponse_({ ok: true });
  } catch (error) {
    console.error(error.stack || error);
    // Return HTTP 200 so LINE does not repeatedly retry a malformed event.
    return jsonResponse_({ ok: false, error: String(error) });
  }
}

function handleEvent_(event) {
  if (!event.replyToken) return;

  const isFollow = event.type === 'follow' || event.type === 'join';
  const isText = event.type === 'message' && event.message &&
    event.message.type === 'text';
  const text = isText ? event.message.text.trim().toLowerCase() : '';
  const asksForId = /^(id|my id|user id|userid|ไอดี|ขอ\s*id|ขอไอดี)$/i.test(text);

  if (isFollow || asksForId) {
    replyText_(event.replyToken, buildIdMessage_(event.source || {}));
  }
}

function buildIdMessage_(source) {
  const lines = ['LINE ID ที่ webhook ได้รับ'];

  if (source.userId) lines.push('userId: ' + source.userId);
  if (source.groupId) lines.push('groupId: ' + source.groupId);
  if (source.roomId) lines.push('roomId: ' + source.roomId);
  lines.push('source type: ' + (source.type || 'unknown'));

  return lines.join('\n');
}

function replyText_(replyToken, text) {
  const accessToken = PropertiesService.getScriptProperties()
    .getProperty('LINE_CHANNEL_ACCESS_TOKEN');

  if (!accessToken) {
    throw new Error('LINE_CHANNEL_ACCESS_TOKEN is not configured');
  }

  const response = UrlFetchApp.fetch(LINE_REPLY_URL, {
    method: 'post',
    contentType: 'application/json',
    headers: { Authorization: 'Bearer ' + accessToken },
    payload: JSON.stringify({
      replyToken: replyToken,
      messages: [{ type: 'text', text: text }]
    }),
    muteHttpExceptions: true
  });

  const status = response.getResponseCode();
  if (status < 200 || status >= 300) {
    throw new Error('LINE reply failed (' + status + '): ' + response.getContentText());
  }
}

function jsonResponse_(body) {
  return ContentService
    .createTextOutput(JSON.stringify(body))
    .setMimeType(ContentService.MimeType.JSON);
}

/**
 * Creates tomorrow's eight hourly rows in "Activity พงศ์พล".
 * Run installActivityTrigger() once to schedule this function every day.
 */
function createNextActivityDate() {
  const spreadsheet = getActivitySpreadsheet_();
  const sheet = spreadsheet.getSheetByName(ACTIVITY_SHEET_NAME);
  if (!sheet) throw new Error('Sheet not found: ' + ACTIVITY_SHEET_NAME);

  const timezone = spreadsheet.getSpreadsheetTimeZone() || 'Asia/Bangkok';
  const tomorrow = new Date();
  tomorrow.setHours(12, 0, 0, 0);
  tomorrow.setDate(tomorrow.getDate() + 1);
  const tomorrowKey = Utilities.formatDate(tomorrow, timezone, 'yyyy-MM-dd');

  const lastDataRow = findLastActivityRow_(sheet);
  if (lastDataRow < 6) throw new Error('No activity template row was found');

  const dateValues = sheet.getRange(6, 2, lastDataRow - 5, 1).getValues();
  const alreadyExists = dateValues.some(function(row) {
    const value = row[0];
    return value instanceof Date &&
      Utilities.formatDate(value, timezone, 'yyyy-MM-dd') === tomorrowKey;
  });
  if (alreadyExists) {
    console.log('Activity rows already exist for ' + tomorrowKey);
    return {
      created: false,
      message: 'มีข้อมูลวันที่ ' + formatThaiDate_(tomorrow, timezone) + ' อยู่แล้ว'
    };
  }

  const startRow = lastDataRow + 1;
  const requiredLastRow = startRow + ACTIVITY_TIME_SLOTS.length - 1;
  if (requiredLastRow > sheet.getMaxRows()) {
    sheet.insertRowsAfter(sheet.getMaxRows(), requiredLastRow - sheet.getMaxRows());
  }

  // Copy the most recent full-day block to preserve formatting and validation.
  const templateStartRow = Math.max(6, lastDataRow - ACTIVITY_TIME_SLOTS.length + 1);
  const columnCount = sheet.getMaxColumns();
  sheet.getRange(templateStartRow, 1, ACTIVITY_TIME_SLOTS.length, columnCount)
    .copyTo(sheet.getRange(startRow, 1, ACTIVITY_TIME_SLOTS.length, columnCount),
      SpreadsheetApp.CopyPasteType.PASTE_FORMAT, false);

  const lastSequence = Number(sheet.getRange(lastDataRow, 1).getValue()) || 0;
  const rows = ACTIVITY_TIME_SLOTS.map(function(timeSlot, index) {
    const isLunch = index === 4;
    return [
      lastSequence + index + 1,
      new Date(tomorrow),
      timeSlot,
      isLunch ? 'พักกลางวัน' : 'ว่าง',
      'ว่าง',
      'ว่าง',
      'ว่าง',
      'ว่าง',
      'ว่าง',
      'ว่าง',
      'ว่าง',
      'ว่าง',
      'ว่าง'
    ];
  });

  sheet.getRange(startRow, 1, rows.length, columnCount).clearContent();
  sheet.getRange(startRow, 1, rows.length, rows[0].length).setValues(rows);
  sheet.getRange(startRow, 2, rows.length, 1).setNumberFormat('d/m/yyyy');
  console.log('Created activity rows for ' + tomorrowKey + ' at rows ' +
    startRow + '-' + requiredLastRow);
  return {
    created: true,
    message: 'สร้างข้อมูลวันที่ ' + formatThaiDate_(tomorrow, timezone) +
      ' เรียบร้อยแล้ว (แถว ' + startRow + '-' + requiredLastRow + ')'
  };
}

function getActivitySpreadsheet_() {
  // Container-bound scripts should use their parent spreadsheet directly.
  const activeSpreadsheet = SpreadsheetApp.getActiveSpreadsheet();
  if (activeSpreadsheet &&
      activeSpreadsheet.getSheetByName(ACTIVITY_SHEET_NAME)) {
    return activeSpreadsheet;
  }

  return SpreadsheetApp.openById(ACTIVITY_SPREADSHEET_ID);
}

/** Run once manually to install the daily trigger around 20:00 Bangkok time. */
function installActivityTrigger() {
  ScriptApp.getProjectTriggers().forEach(function(trigger) {
    if (trigger.getHandlerFunction() === 'createNextActivityDate') {
      ScriptApp.deleteTrigger(trigger);
    }
  });

  ScriptApp.newTrigger('createNextActivityDate')
    .timeBased()
    .atHour(20)
    .nearMinute(0)
    .everyDays(1)
    .inTimezone('Asia/Bangkok')
    .create();

  console.log('Daily Activity trigger installed for around 20:00 Asia/Bangkok');
}

function findLastActivityRow_(sheet) {
  const firstDataRow = 6;
  const rowCount = Math.max(0, sheet.getLastRow() - firstDataRow + 1);
  if (!rowCount) return firstDataRow - 1;

  const sequences = sheet.getRange(firstDataRow, 1, rowCount, 1).getValues();
  for (let index = sequences.length - 1; index >= 0; index--) {
    if (typeof sequences[index][0] === 'number' && sequences[index][0] > 0) {
      return firstDataRow + index;
    }
  }
  return firstDataRow - 1;
}

function formatThaiDate_(date, timezone) {
  return Utilities.formatDate(date, timezone, 'd/M/yyyy');
}
