const LINE_REPLY_URL = 'https://api.line.me/v2/bot/message/reply';

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
