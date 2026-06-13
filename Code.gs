const LINE_REPLY_URL = 'https://api.line.me/v2/bot/message/reply';
const LINE_PUSH_URL = 'https://api.line.me/v2/bot/message/push';
const ACTIVITY_SHEET_PREFIX = 'Activity ';
const HOLIDAY_SHEET_NAME = 'วันหยุด';
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
    'ต้องการสร้างข้อมูลวันพรุ่งนี้ในทุกชีต Activity หรือไม่?',
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
 * Creates tomorrow's blank rows in every sheet whose name starts with "Activity ".
 * Run installActivityTrigger() once to schedule this function every day.
 */
function createNextActivityDate() {
  const spreadsheet = getActivitySpreadsheet_();
  const timezone = spreadsheet.getSpreadsheetTimeZone() || 'Asia/Bangkok';
  const tomorrow = new Date();
  tomorrow.setHours(12, 0, 0, 0);
  tomorrow.setDate(tomorrow.getDate() + 1);
  const nonWorkingDay = getNonWorkingDayReason_(spreadsheet, tomorrow, timezone);
  if (nonWorkingDay) {
    const skipMessage = 'ไม่สร้าง Activity วันที่ ' +
      formatThaiDate_(tomorrow, timezone) + ': ' + nonWorkingDay;
    console.log(skipMessage);
    return {
      created: false,
      skipped: true,
      results: [],
      message: skipMessage
    };
  }
  const results = [];

  spreadsheet.getSheets().forEach(function(sheet) {
    if (!isActivitySheet_(sheet)) return;
    try {
      results.push(createNextActivityDateForSheet_(sheet, tomorrow, timezone));
    } catch (error) {
      console.error(sheet.getName() + ': ' + (error.stack || error));
      results.push({
        sheet: sheet.getName(),
        created: false,
        reason: error.message || String(error)
      });
    }
  });

  const createdCount = results.filter(function(result) { return result.created; }).length;
  const createdNames = results.filter(function(result) {
    return result.created;
  }).map(function(result) { return result.sheet; });
  const existingNames = results.filter(function(result) {
    return !result.created && result.reason === 'มีวันที่แล้ว';
  }).map(function(result) { return result.sheet; });
  const failedDetails = results.filter(function(result) {
    return !result.created && result.reason !== 'มีวันที่แล้ว';
  }).map(function(result) { return result.sheet + ': ' + result.reason; });
  const messageLines = [
    'สร้างแล้ว ' + createdCount + ' ชีต'
  ];
  if (createdNames.length) {
    results.filter(function(result) { return result.created; }).forEach(function(result) {
      messageLines.push('✓ ' + result.sheet + ' → ' + result.date);
    });
  }
  if (existingNames.length) messageLines.push('มีอยู่แล้ว: ' + existingNames.join(', '));
  if (failedDetails.length) messageLines.push('ผิดพลาด:\n' + failedDetails.join('\n'));
  return {
    created: createdCount > 0,
    results: results,
    message: messageLines.join('\n')
  };
}

function createNextActivityDateForSheet_(sheet, tomorrow, timezone) {
  const tomorrowKey = Utilities.formatDate(tomorrow, timezone, 'yyyy-MM-dd');
  const firstDataRow = findActivityFirstDataRow_(sheet);
  const template = findLatestActivityDayBlock_(
    sheet, firstDataRow, sheet.getLastRow(), timezone
  );
  if (!template) {
    return { sheet: sheet.getName(), created: false, reason: 'ไม่มีข้อมูลต้นแบบ' };
  }
  if (hasCompleteTomorrowBlock_(sheet, firstDataRow, tomorrowKey, timezone)) {
    return { sheet: sheet.getName(), created: false, reason: 'มีวันที่แล้ว' };
  }

  // All Activity sheets use eight working-hour rows per day.
  const rowCount = 8;
  // Append after the physical last row, regardless of the sheet's latest date.
  const startRow = sheet.getLastRow() + 1;
  const requiredLastRow = startRow + rowCount - 1;
  if (requiredLastRow > sheet.getMaxRows()) {
    sheet.insertRowsAfter(sheet.getMaxRows(), requiredLastRow - sheet.getMaxRows());
  }

  const columnCount = sheet.getMaxColumns();
  const templateStartRow = Math.max(firstDataRow, template.startRow);
  const source = sheet.getRange(templateStartRow, 1, rowCount, columnCount);
  const target = sheet.getRange(startRow, 1, rowCount, columnCount);
  // One copy preserves formats, dropdowns, row structure and formulas. Content is
  // cleared immediately afterwards, reducing service calls across many sheets.
  source.copyTo(target, SpreadsheetApp.CopyPasteType.PASTE_NORMAL, false);
  target.clearContent();
  target.setBorder(true, true, true, true, true, true);

  const templateCoreValues = sheet.getRange(
    templateStartRow, 1, rowCount, 3
  ).getValues();
  const sequenceSource = templateCoreValues.map(function(row) { return [row[0]]; });
  const templateUsesSequence = sequenceSource.some(function(row) {
    return typeof row[0] === 'number' && row[0] > 0;
  });
  const lastSequence = templateUsesSequence ? findMaxSequence_(sheet, firstDataRow) : 0;
  const sequenceValues = [];
  const dateValues = [];
  const timeValues = [];
  for (let index = 0; index < rowCount; index++) {
    sequenceValues.push([templateUsesSequence ? lastSequence + index + 1 : '']);
    dateValues.push([new Date(tomorrow)]);
    timeValues.push([ACTIVITY_TIME_SLOTS[index]]);
  }
  sheet.getRange(startRow, 1, rowCount, 1).setValues(sequenceValues);
  sheet.getRange(startRow, 2, rowCount, 1).setValues(dateValues).setNumberFormat('d/m/yyyy');
  sheet.getRange(startRow, 3, rowCount, 1).setValues(timeValues);

  return {
    sheet: sheet.getName(),
    created: true,
    rows: rowCount,
    date: formatThaiDate_(tomorrow, timezone)
  };
}

function hasCompleteTomorrowBlock_(sheet, firstDataRow, tomorrowKey, timezone) {
  const rowCount = sheet.getLastRow() - firstDataRow + 1;
  if (rowCount < ACTIVITY_TIME_SLOTS.length) return false;

  const values = sheet.getRange(firstDataRow, 2, rowCount, 2).getValues();
  for (let start = 0; start <= values.length - ACTIVITY_TIME_SLOTS.length; start++) {
    let complete = true;
    for (let index = 0; index < ACTIVITY_TIME_SLOTS.length; index++) {
      const dateKey = normalizeSheetDate_(values[start + index][0], timezone);
      const timeText = String(values[start + index][1] || '').trim();
      if (dateKey !== tomorrowKey || timeText !== ACTIVITY_TIME_SLOTS[index]) {
        complete = false;
        break;
      }
    }
    if (complete) return true;
  }
  return false;
}

function getActivitySpreadsheet_() {
  // Container-bound scripts should use their parent spreadsheet directly.
  const activeSpreadsheet = SpreadsheetApp.getActiveSpreadsheet();
  if (activeSpreadsheet && activeSpreadsheet.getSheets().some(isActivitySheet_)) {
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
  const nonWorkingDay = getNonWorkingDayReason_(spreadsheet, today, timezone);
  if (nonWorkingDay) {
    const skipMessage = 'งดส่ง LINE: ' + nonWorkingDay;
    console.log(skipMessage);
    return {
      missing: [],
      completed: [],
      sent: false,
      skipped: true,
      message: skipMessage
    };
  }
  const missingNames = [];
  const completedNames = [];

  spreadsheet.getSheets().forEach(function(sheet) {
    if (!isActivitySheet_(sheet)) return;

    const personName = sheet.getName().substring(ACTIVITY_SHEET_PREFIX.length).trim();
    const status = getActivityStatusForDate_(sheet, todayKey, timezone);
    if (status.completed) {
      completedNames.push(personName);
    } else {
      missingNames.push(personName);
    }
  });

  if (!missingNames.length) {
    const completeMessage = '✅ ทีม IT บันทึก Activity ครบเรียบร้อยแล้ว\nวันที่ ' +
      Utilities.formatDate(today, timezone, 'd/M/yyyy');
    const reportUserId = PropertiesService.getScriptProperties()
      .getProperty('ACTIVITY_REPORT_LINE_USER_ID');
    if (!reportUserId) {
      throw new Error('ACTIVITY_REPORT_LINE_USER_ID is not configured');
    }
    pushText_(reportUserId, completeMessage);
    console.log(completeMessage);
    return {
      missing: [],
      completed: completedNames,
      sent: true,
      message: completeMessage
    };
  }

  const lines = [
    '🔔 แจ้งเตือนการลง Activity',
    '',
    'ผู้ใช้งานที่ยังไม่ได้บันทึก Activity วันนี้'
  ];
  missingNames.forEach(function(name) { lines.push('• ' + name); });

  const message = lines.join('\n');
  const reportUserId = PropertiesService.getScriptProperties()
    .getProperty('ACTIVITY_REPORT_LINE_USER_ID');
  if (!reportUserId) {
    throw new Error('ACTIVITY_REPORT_LINE_USER_ID is not configured');
  }
  pushText_(reportUserId, message);
  console.log(message);
  return {
    missing: missingNames,
    completed: completedNames,
    sent: true,
    message: message
  };
}

function getNonWorkingDayReason_(spreadsheet, date, timezone) {
  const localDateKey = Utilities.formatDate(date, timezone, 'yyyy-MM-dd');
  const dateParts = localDateKey.split('-').map(Number);
  const dayOfWeek = new Date(
    dateParts[0], dateParts[1] - 1, dateParts[2], 12, 0, 0, 0
  ).getDay();
  if (dayOfWeek === 6) return 'วันเสาร์';
  if (dayOfWeek === 0) return 'วันอาทิตย์';

  const holidaySheet = spreadsheet.getSheetByName(HOLIDAY_SHEET_NAME);
  if (!holidaySheet || holidaySheet.getLastRow() < 1 || holidaySheet.getLastColumn() < 1) {
    return '';
  }

  const targetDateKey = Utilities.formatDate(date, timezone, 'yyyy-MM-dd');
  const values = holidaySheet.getDataRange().getValues();
  for (let row = 0; row < values.length; row++) {
    for (let column = 0; column < values[row].length; column++) {
      if (normalizeSheetDate_(values[row][column], timezone) === targetDateKey) {
        const description = values[row].filter(function(value) {
          return normalizeSheetDate_(value, timezone) !== targetDateKey;
        }).map(function(value) {
          return String(value || '').trim();
        }).filter(Boolean).join(' ');
        return description ? 'วันหยุด: ' + description : 'วันที่ระบุในชีตวันหยุด';
      }
    }
  }
  return '';
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

function isActivitySheet_(sheet) {
  return sheet.getName().indexOf(ACTIVITY_SHEET_PREFIX) === 0;
}

function findLatestActivityDayBlock_(sheet, firstDataRow, lastDataRow, timezone) {
  const dateValues = sheet.getRange(
    firstDataRow, 2, lastDataRow - firstDataRow + 1, 1
  ).getValues();
  const dateBlocks = [];
  let currentDateKey = '';
  for (let index = 0; index < dateValues.length; index++) {
    const explicitDateKey = normalizeSheetDate_(dateValues[index][0], timezone);
    if (explicitDateKey && explicitDateKey !== currentDateKey) {
      currentDateKey = explicitDateKey;
      dateBlocks.push({ dateKey: explicitDateKey, startIndex: index });
    }
  }
  if (!dateBlocks.length) return null;

  // Use the last physically recorded date as the template anchor. A fixed 8-row
  // block avoids malformed dates inside a day changing the generated row count.
  const latestBlock = dateBlocks[dateBlocks.length - 1];
  let latestStartIndex = latestBlock.startIndex;
  const timeValues = sheet.getRange(
    firstDataRow, 3, dateValues.length, 1
  ).getDisplayValues();
  for (let index = latestStartIndex; index >= Math.max(0, latestStartIndex - 7); index--) {
    const timeText = String(timeValues[index][0] || '').trim();
    if (/^(8(?::00)?\s*-\s*9(?::00)?|8)$/.test(timeText)) {
      latestStartIndex = index;
      break;
    }
  }
  const rowCount = 8;
  const dateOnEveryRow = dateValues.slice(latestStartIndex, latestStartIndex + rowCount)
    .every(function(row) { return Boolean(normalizeSheetDate_(row[0], timezone)); });
  const headerValues = sheet.getRange(1, 1, Math.min(10, sheet.getLastRow()), 3)
    .getDisplayValues();
  const hasTimeColumn = headerValues.some(function(row) {
    return row[2] === 'เวลา' || row[2] === 'ชั่วโมงที่';
  });
  return {
    startRow: firstDataRow + latestStartIndex,
    rowCount: rowCount,
    dateKey: latestBlock.dateKey,
    dateOnEveryRow: dateOnEveryRow,
    hasTimeColumn: hasTimeColumn
  };
}


function findMaxSequence_(sheet, firstDataRow) {
  const rowCount = Math.max(1, sheet.getLastRow() - firstDataRow + 1);
  const values = sheet.getRange(firstDataRow, 1, rowCount, 1).getValues();
  return values.reduce(function(maxValue, row) {
    const value = Number(row[0]);
    return Number.isFinite(value) && value > maxValue ? value : maxValue;
  }, 0);
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

function findLastActivityRow_(sheet, firstDataRow) {
  firstDataRow = firstDataRow || findActivityFirstDataRow_(sheet);
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
