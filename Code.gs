const LINE_REPLY_URL = 'https://api.line.me/v2/bot/message/reply';
const LINE_PUSH_URL = 'https://api.line.me/v2/bot/message/push';
const ACTIVITY_SHEET_NAME = 'Activity พงศ์พล';
const ACTIVITY_SHEET_PREFIX = 'Activity ';
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
    .addItem('ตรวจ Activity วันนี้และส่ง LINE', 'checkDailyActivityAndNotifyManual')
    .addItem('ติดตั้งทริกเกอร์ 18:00 / 20:00', 'installActivityTriggerManual')
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
    showActivityMessage_(
      'ติดตั้งทริกเกอร์สร้างวันพรุ่งนี้เวลา 18:00 และตรวจ Activity เวลา 20:00 เรียบร้อยแล้ว'
    );
  } catch (error) {
    showActivityMessage_('ติดตั้งทริกเกอร์ไม่สำเร็จ: ' + error.message);
    throw error;
  }
}

function checkDailyActivityAndNotifyManual() {
  try {
    const result = checkDailyActivityAndNotify();
    SpreadsheetApp.getUi().alert(result.message);
  } catch (error) {
    SpreadsheetApp.getUi().alert('ตรวจ Activity ไม่สำเร็จ: ' + error.message);
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

function pushText_(userId, text) {
  const accessToken = PropertiesService.getScriptProperties()
    .getProperty('LINE_CHANNEL_ACCESS_TOKEN');

  if (!accessToken) {
    throw new Error('LINE_CHANNEL_ACCESS_TOKEN is not configured');
  }

  const response = UrlFetchApp.fetch(LINE_PUSH_URL, {
    method: 'post',
    contentType: 'application/json',
    headers: { Authorization: 'Bearer ' + accessToken },
    payload: JSON.stringify({
      to: userId,
      messages: [{ type: 'text', text: text }]
    }),
    muteHttpExceptions: true
  });

  const status = response.getResponseCode();
  if (status < 200 || status >= 300) {
    throw new Error('LINE push failed (' + status + '): ' + response.getContentText());
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

  // Copy the most recent full-day block to preserve formatting and dropdowns.
  const templateStartRow = Math.max(6, lastDataRow - ACTIVITY_TIME_SLOTS.length + 1);
  const columnCount = sheet.getMaxColumns();
  sheet.getRange(templateStartRow, 1, ACTIVITY_TIME_SLOTS.length, columnCount)
    .copyTo(sheet.getRange(startRow, 1, ACTIVITY_TIME_SLOTS.length, columnCount),
      SpreadsheetApp.CopyPasteType.PASTE_FORMAT, false);
  sheet.getRange(templateStartRow, 1, ACTIVITY_TIME_SLOTS.length, columnCount)
    .copyTo(sheet.getRange(startRow, 1, ACTIVITY_TIME_SLOTS.length, columnCount),
      SpreadsheetApp.CopyPasteType.PASTE_DATA_VALIDATION, false);

  const lastSequence = Number(sheet.getRange(lastDataRow, 1).getValue()) || 0;
  const rows = ACTIVITY_TIME_SLOTS.map(function(timeSlot, index) {
    return [
      lastSequence + index + 1,
      new Date(tomorrow),
      timeSlot
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

  const spreadsheetId = PropertiesService.getScriptProperties()
    .getProperty('ACTIVITY_SPREADSHEET_ID');
  if (!spreadsheetId) {
    throw new Error('ACTIVITY_SPREADSHEET_ID is not configured');
  }
  return SpreadsheetApp.openById(spreadsheetId);
}

/** Run once to install both daily automation triggers. */
function installActivityTrigger() {
  ScriptApp.getProjectTriggers().forEach(function(trigger) {
    const handler = trigger.getHandlerFunction();
    if (handler === 'createNextActivityDate' ||
        handler === 'checkDailyActivityAndNotify') {
      ScriptApp.deleteTrigger(trigger);
    }
  });

  ScriptApp.newTrigger('createNextActivityDate')
    .timeBased()
    .atHour(18)
    .nearMinute(0)
    .everyDays(1)
    .inTimezone('Asia/Bangkok')
    .create();

  ScriptApp.newTrigger('checkDailyActivityAndNotify')
    .timeBased()
    .atHour(20)
    .nearMinute(0)
    .everyDays(1)
    .inTimezone('Asia/Bangkok')
    .create();

  console.log('Activity triggers installed for 18:00 and 20:00 Asia/Bangkok');
}

function checkDailyActivityAndNotify() {
  const spreadsheet = getActivitySpreadsheet_();
  const timezone = spreadsheet.getSpreadsheetTimeZone() || 'Asia/Bangkok';
  const today = new Date();
  const todayKey = Utilities.formatDate(today, timezone, 'yyyy-MM-dd');
  const missingNames = [];
  const completedNames = [];

  spreadsheet.getSheets().forEach(function(sheet) {
    const sheetName = sheet.getName();
    if (sheetName.indexOf(ACTIVITY_SHEET_PREFIX) !== 0) return;

    const personName = sheetName.substring(ACTIVITY_SHEET_PREFIX.length).trim();
    const status = getActivityStatusForDate_(sheet, todayKey, timezone);
    if (status.completed) {
      completedNames.push(personName);
    } else {
      missingNames.push(personName);
    }
  });

  const displayDate = Utilities.formatDate(today, timezone, 'd/M/yyyy');
  const lines = ['สรุปการลง Activity วันที่ ' + displayDate];
  if (missingNames.length) {
    lines.push('', 'ยังไม่ลง Activity (' + missingNames.length + ' คน)');
    missingNames.forEach(function(name) { lines.push('- ' + name); });
  } else {
    lines.push('', 'ทุกคนลง Activity แล้ว');
  }
  lines.push('', 'ลงแล้ว: ' + completedNames.length + ' คน');

  const message = lines.join('\n');
  const reportUserId = PropertiesService.getScriptProperties()
    .getProperty('ACTIVITY_REPORT_LINE_USER_ID');
  if (!reportUserId) {
    throw new Error('ACTIVITY_REPORT_LINE_USER_ID is not configured');
  }
  pushText_(reportUserId, message);
  console.log(message);
  return { missing: missingNames, completed: completedNames, message: message };
}

function getActivityStatusForDate_(sheet, targetDateKey, timezone) {
  const firstDataRow = findActivityFirstDataRow_(sheet);
  const lastRow = sheet.getLastRow();
  const lastColumn = sheet.getLastColumn();
  if (firstDataRow > lastRow || lastColumn < 4) {
    return { completed: false, hasDate: false };
  }

  const values = sheet.getRange(
    firstDataRow, 1, lastRow - firstDataRow + 1, lastColumn
  ).getValues();
  let currentDateKey = '';
  let hasDate = false;
  let hasRealActivity = false;

  values.forEach(function(row) {
    if (row[1] instanceof Date) {
      currentDateKey = Utilities.formatDate(row[1], timezone, 'yyyy-MM-dd');
    } else if (String(row[1] || '').trim()) {
      currentDateKey = normalizeSheetDate_(row[1], timezone);
    }
    if (currentDateKey !== targetDateKey) return;

    hasDate = true;
    const activityStartColumn = sheet.getName() === 'Activity ปาลิกา' ? 2 : 3;
    for (let column = activityStartColumn; column < row.length; column++) {
      const value = String(row[column] || '').trim();
      if (value && value !== 'ว่าง' && value !== 'พักกลางวัน') {
        hasRealActivity = true;
        break;
      }
    }
  });

  return { completed: hasDate && hasRealActivity, hasDate: hasDate };
}

function findActivityFirstDataRow_(sheet) {
  const scanRows = Math.min(10, sheet.getLastRow());
  if (!scanRows) return 1;
  const values = sheet.getRange(1, 1, scanRows, Math.min(3, sheet.getLastColumn()))
    .getDisplayValues();
  for (let row = 0; row < values.length; row++) {
    if (values[row][1] === 'วันที่') return row + 2;
  }
  return 2;
}

function normalizeSheetDate_(value, timezone) {
  if (value instanceof Date) {
    return Utilities.formatDate(value, timezone, 'yyyy-MM-dd');
  }
  const match = String(value || '').trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (!match) return '';
  return match[3] + '-' + ('0' + match[2]).slice(-2) + '-' +
    ('0' + match[1]).slice(-2);
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

function showActivityMessage_(message) {
  console.log(message);
  const spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
  if (spreadsheet) spreadsheet.toast(message, 'Activity Tools', 8);
}
