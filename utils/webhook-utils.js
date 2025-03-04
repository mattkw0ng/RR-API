const { google } = require('googleapis');
const { authorize } = require('./authorize');
const pool = require('../db');

async function watchCalendar(calendarId) {
  const auth = await authorize();
  const calendar = google.calendar({ version: 'v3', auth });
  const safeCalendarId = calendarId.split('@')[0];

  // Generate a valid and unique Channel ID
  const channelId = `watch-${safeCalendarId}-${Date.now()}`;
  console.log(channelId);

  const response = await calendar.events.watch({
    calendarId: calendarId,
    requestBody: {
      id: channelId, // Unique channel ID
      type: 'web_hook',
      address: 'https://api.rooms.sjcac.org/webhook', // Your webhook endpoint
      params: { ttl: 604800 } // Max 7 days (must renew periodically)
    },
  });

  console.log("Watch request successful:", response.data);

  const resourceId= response.data.resourceId;

  await saveResourceIdMapping(resourceId, calendarId, channelId);
  console.log(`🔗 Stored mapping: ${resourceId} → ${calendarId}`);
}

async function saveResourceIdMapping(resourceId, calendarId, channelId) {
  try {
    await pool.query(
      `INSERT INTO watch_mapping (resource_id, calendar_id, channel_id, created_at)
       VALUES ($1, $2, $3, NOW())
       ON CONFLICT (resource_id) DO UPDATE
       SET calendar_id = EXCLUDED.calendar_id, channel_id = EXCLUDED.channel_id, created_at = NOW()`,
      [resourceId, calendarId, channelId]
    );
    console.log(`✅ Saved resourceId mapping: ${resourceId} → ${calendarId}`);
  } catch (error) {
    console.error("❌ Error saving resourceId mapping:", error);
  }
}

async function getCalendarIdByResourceId(resourceId) {
  const result = await pool.query("SELECT calendar_id FROM watch_mapping WHERE resource_id = $1", [resourceId]);

  return result.rows.length ? result.rows[0].calendar_id : null;
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

async function getStoredSyncToken(calendarId) {
  const result = await pool.query(`SELECT sync_token FROM google_sync_tokens WHERE calendar_id = $1`, [calendarId]);
  return result.rows[0]?.sync_token || null;
}

module.exports = {
  watchCalendar,
  syncCalendarChanges,
  storeSyncToken,
  getStoredSyncToken,
  saveResourceIdMapping,
  getCalendarIdByResourceId,
}