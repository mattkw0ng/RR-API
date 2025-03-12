const { google } = require('googleapis');
const { authorize } = require('./authorize');
const pool = require('../db');

const PENDING_APPROVAL_CALENDAR_ID = process.env.PENDING_APPROVAL_CALENDAR_ID;
const APPROVED_CALENDAR_ID = process.env.APPROVED_CALENDAR_ID;
const PROPOSED_CHANGES_CALENDAR_ID = process.env.PROPOSED_CHANGES_CALENDAR_ID;

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

  const resourceId = response.data.resourceId;

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

async function stopExistingWatches(calendarId) {
  const auth = await authorize();
  const calendar = google.calendar({ version: 'v3', auth });

  // Fetch both channel_id and resource_id from the database
  const result = await pool.query("SELECT channel_id, resource_id FROM watch_mapping WHERE calendar_id = $1", [calendarId]);

  if (result.rows.length > 0) {
    const { channel_id, resource_id } = result.rows[0];

    console.log(`🛑 Stopping existing watch for ${calendarId} with channel ID: ${channel_id} and resource ID: ${resource_id}`);

    try {
      // Stop the existing watch (requires both channel_id and resource_id)
      await calendar.channels.stop({
        requestBody: {
          id: channel_id,  // Unique channel ID
          resourceId: resource_id, // Google-assigned resource ID
        },
      });

      console.log(`✅ Successfully stopped watch for ${calendarId}`);

      // Remove the mapping from the database
      await pool.query("DELETE FROM watch_mapping WHERE calendar_id = $1", [calendarId]);

    } catch (error) {
      console.error(`❌ Error stopping watch for ${calendarId}:`, error);
    }
  } else {
    console.log(`ℹ️ No existing watch found for ${calendarId}`);
  }
}


async function getCalendarIdByResourceId(resourceId) {
  console.log("~~ gettingCalendarIdByResourceID: ", resourceId);
  const result = await pool.query("SELECT calendar_id FROM watch_mapping WHERE resource_id = $1", [resourceId]);
  return result.rows.length ? result.rows[0].calendar_id : null;
}

async function fullCalendarSync(calendarId) {
  const auth = await authorize();
  const calendar = google.calendar({ version: 'v3', auth });

  try {
    console.log(`Performing full sync for calendar: ${calendarId}`);

    let allEvents = [];
    let nextPageToken = null;
    const now = new Date();
    const sixMonthsLater = new Date();
    sixMonthsLater.setMonth(now.getMonth() + 6);

    // Fetch all events using pagination
    do {
      const response = await calendar.events.list({
        calendarId: calendarId,
        singleEvents: true,
        orderBy: "startTime",
        timeMin: now.toISOString(),
        timeMax: sixMonthsLater.toISOString(),
        pageToken: nextPageToken,
      });

      allEvents.push(...response.data.items);
      nextPageToken = response.data.nextPageToken;
    } while (nextPageToken);

    console.log(`Full sync fetched ${allEvents.length} events for calendar ${calendarId}`);

    // Store fetched events in the database
    await storeEvents(allEvents, calendarId);

    // Store the new sync token for future incremental updates
    if (allEvents.length > 0 && allEvents[0].nextSyncToken) {
      await storeSyncToken(allEvents[0].nextSyncToken, calendarId);
      console.log("New sync token stored successfully");
    } else {
      console.warn("No sync token available after full sync");
    }

  } catch (error) {
    console.error(`Error during full sync for ${calendarId}:`, error);
  }
}

async function syncAllCalendarsOnStartup() {
  console.log("Starting full calendar sync on server startup...");
  console.log("🗑️ Removing old events...");
  await pool.query("DELETE FROM events WHERE end_time < NOW()"); // Deletes past events

  const calendarIds = [PENDING_APPROVAL_CALENDAR_ID, APPROVED_CALENDAR_ID, PROPOSED_CHANGES_CALENDAR_ID];

  for (const calendarId of calendarIds) {
    await stopExistingWatches(calendarId);
    await fullCalendarSync(calendarId);
  }

  console.log("Initial full sync for all calendars completed.");
}



async function syncCalendarChanges(syncToken, calendarId) {
  console.log("++ SyncCalendarChanges | syncToken: ", syncToken);
  const auth = await authorize();
  const calendar = google.calendar({ version: 'v3', auth })

  const now = new Date();
  const sixMonthsLater = new Date();
  sixMonthsLater.setMonth(now.getMonth() + 6);

  try {
    const response = await calendar.events.list({
      calendarId: calendarId,
      syncToken: syncToken,
    });

    const filtered = response.data.items.filter(e => 
      e.end?.dateTime && new Date(e.end.dateTime) < sixMonthsLater
    );

    console.log("++ UpdatedEvents: ", response.data.items.length, " filtered: ", filtered.length);

    if (response.data.nextSyncToken) {
      await storeSyncToken(response.data.nextSyncToken, calendarId);
    }

    // await processEvents(response.data.items, calendarId);
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
  console.log(">> getStoredSyncToken for calendar: ", calendarId);
  const result = await pool.query(`SELECT sync_token FROM google_sync_tokens WHERE calendar_id = $1`, [calendarId]);
  return result.rows[0]?.sync_token || null;
}

async function storeEvents(eventList, calendarId) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    for (const event of eventList) {
      if (event.status === 'confirmed') {
        const { id: eventId, start, end, recurrence, attendees, extendedProperties } = event;

        const startTime = new Date(start.dateTime).toISOString();
        const endTime = new Date(end.dateTime).toISOString();
        const recurrenceRule = recurrence ? recurrence.join(';') : null;

        let rooms = [];
        if (extendedProperties?.private?.rooms) {
          rooms = JSON.parse(extendedProperties.private.rooms).map(r => r.email);
        } else if (attendees) {
          rooms = attendees.filter(a => a.resource).map(a => a.email);
        }

        await client.query(
          `INSERT INTO events (event_id, calendar_id, start_time, end_time, recurrence_rule, rooms, updated_at)
        VALUES ($1, $2, $3, $4, $5, $6, NOW())
        ON CONFLICT (event_id) DO UPDATE
        SET start_time = EXCLUDED.start_time,
            end_time = EXCLUDED.end_time,
            recurrence_rule = EXCLUDED.recurrence_rule,
            rooms = EXCLUDED.rooms,
            updated_at = NOW()
        `, [eventId, calendarId, startTime, endTime, recurrenceRule, rooms]
        )
      }
    }

    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    console.error("error storing events", error);
  } finally {
    client.release();
  }
}

async function processEvents(events, calendarId) {
  const auth = await authorize();
  const calendar = google.calendar({ version: 'v3', auth });

  let expandedEvents = [];

  for (const event of events) {
    if (event.recurrence) {
      try {
        const instancesResponse = await calendar.events.instances({
          calendarId: calendarId,
          eventId: event.id,
        })

        console.log(`Expanded ${instancesResponse.data.items.length} instances for event: ${event.id}`);

        expandedEvents.push(...instancesResponse.data.items);
      } catch (error) {
        console.error(`Error expanding instances for event ${event.id}:`, error);
      }
    } else {
      expandedEvents.push(event);
    }
  }

  storeEvents(expandedEvents, calendarId);
}

module.exports = {
  watchCalendar,
  syncCalendarChanges,
  storeSyncToken,
  getStoredSyncToken,
  saveResourceIdMapping,
  getCalendarIdByResourceId,
  storeEvents,
  processEvents,
  syncAllCalendarsOnStartup,
}