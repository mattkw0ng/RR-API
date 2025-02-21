const { google } = require('googleapis');
const { authorize } = require('./authorize');
const { pool } = require('../db');

async function watchCalendar(calendarId) {
  const auth = await authorize();
  const calendar = google.calendar({ version: 'v3', auth });
  const channelID = `watch-${calendarId}-${Date.now()}`;
  console.log(channelID);

  const response = await calendar.events.watch({
    calendarId: calendarId,
    requestBody: {
      id: channelID, // Unique channel ID
      type: 'web_hook',
      address: 'https://api.rooms.sjcac.org/webhook', // Your webhook endpoint
      params: { ttl: 604800 } // Max 7 days (must renew periodically)
    },
  });

  console.log("Watch request successful:", response.data);
}

async function syncCalendarChanges(syncToken, calendarId) {
  const auth = await authorize();
  const calendar = google.calendar({ version: 'v3', auth })

  try {
    const response = await calendar.events.list({
      calendarId: calendarId,
      syncToken: syncToken,
    });

    console.log("UpdatedEvents", response.data.items);

    if (response.data.nextSyncToken) {
      await storeSyncToken(response.data.nextSyncToken, calendarId);
    }

  } catch (error) {
    if (error.code === 410) {
      console.log("Sync token expired, full sync required...");
      await fullCalendarSync();
    } else {
      console.error("Error syncing calendar: ", error);
    }
  }
}

async function storeSyncToken(syncToken, calendarId) {
  await pool.query(
    `INSERT INTO google_sync_tokens (calendar_id, sync_token)
    VALUES ($1, $2)
    ON CONFLICT (calendar_id) DO UPDATE SET sync_token = EXCLUDED.sync_token, updated_at = NOW()`,
    [calendarId, syncToken]
  )
}

async function getStoredSyncToken() {
  const result = await pool.query(`SELECT sync_token FROM google_sync_tokens WHERE calendar_id = $1`, [calendarId]);
  return result.rows[0]?.sync_token || null;
}

module.exports = {
  watchCalendar,
  syncCalendarChanges,
  storeSyncToken,
  getStoredSyncToken
}