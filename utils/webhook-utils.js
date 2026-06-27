const { google } = require('googleapis');
const { authorize } = require('./authorize');
const pool = require('../db');

const PENDING_APPROVAL_CALENDAR_ID = process.env.PENDING_APPROVAL_CALENDAR_ID;
const APPROVED_CALENDAR_ID = process.env.APPROVED_CALENDAR_ID;
const PROPOSED_CHANGES_CALENDAR_ID = process.env.PROPOSED_CHANGES_CALENDAR_ID;

// =========================================================================
// 1. WEBHOOK MANAGEMENT (WATCH Channels)
// =========================================================================

async function watchCalendar(calendarId) {
  const auth = await authorize();
  const calendar = google.calendar({ version: 'v3', auth });
  const safeCalendarId = calendarId.split('@')[0];
  const channelId = `watch-${safeCalendarId}-${Date.now()}`;

  const response = await calendar.events.watch({
    calendarId: calendarId,
    requestBody: {
      id: channelId,
      type: 'web_hook',
      address: 'https://api.rooms.sjcac.org/webhook', 
      params: { ttl: 604800 } // 7 days
    },
  });

  console.log("Watch request successful:", response.data);
  await saveResourceIdMapping(response.data.resourceId, calendarId, channelId);
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

  const result = await pool.query("SELECT channel_id, resource_id FROM watch_mapping WHERE calendar_id = $1", [calendarId]);

  if (result.rows.length > 0) {
    const { channel_id, resource_id } = result.rows[0];
    console.log(`🛑 Stopping existing watch for ${calendarId} (Channel: ${channel_id})`);

    try {
      await calendar.channels.stop({
        requestBody: { id: channel_id, resourceId: resource_id },
      });
      await pool.query("DELETE FROM watch_mapping WHERE calendar_id = $1", [calendarId]);
      console.log(`✅ Successfully stopped watch for ${calendarId}`);
    } catch (error) {
      console.error(`❌ Error stopping watch for ${calendarId}:`, error);
    }
  }
}

async function getCalendarIdByResourceId(resourceId, channelId) {
  const result = await pool.query(
    "SELECT calendar_id FROM watch_mapping WHERE resource_id = $1 AND channel_id = $2",
    [resourceId, channelId]
  );
  return result.rows.length ? result.rows[0].calendar_id : null;
}

// =========================================================================
// 2. TIMELINE SYNCHRONIZATION LOGIC
// =========================================================================

async function fullCalendarSync(calendarId) {
  const auth = await authorize();
  const calendar = google.calendar({ version: 'v3', auth });
  
  try {
    console.log(`🔄 Performing scoped full sync for calendar: ${calendarId}`);

    let allEvents = [];
    let nextPageToken = null;
    let finalSyncToken = null;
    
    const now = new Date();
    const sixMonthsLater = new Date();
    sixMonthsLater.setMonth(now.getMonth() + 6);

    do {
      const response = await calendar.events.list({
        calendarId: calendarId,
        singleEvents: true,
        orderBy: "startTime",
        timeMin: now.toISOString(),
        timeMax: sixMonthsLater.toISOString(),
        showDeleted: false,
        pageToken: nextPageToken,
      });

      if (response.data.items) {
        allEvents.push(...response.data.items);
      }
      
      nextPageToken = response.data.nextPageToken;
      
      // Google only returns nextSyncToken on the final structural page of data
      if (response.data.nextSyncToken) {
        finalSyncToken = response.data.nextSyncToken;
      }
    } while (nextPageToken);

    // Filter down to confirmed items for insertion safety
    const confirmedEvents = allEvents.filter(event => event.status === 'confirmed');
    await storeEvents(confirmedEvents, calendarId);

    // If Google didn't give us a sync token because we used time limits, 
    // we fetch a fresh baseline token without filters to safeguard webhooks.
    if (!finalSyncToken) {
      const tokenCheck = await calendar.events.list({ calendarId, maxResults: 1 });
      finalSyncToken = tokenCheck.data.nextSyncToken;
    }

    if (finalSyncToken) {
      await storeSyncToken(finalSyncToken, calendarId);
      console.log(`✅ Scoped full sync finished. Baseline Sync Token written for ${calendarId}`);
    }

  } catch (error) {
    console.error(`❌ Critical error during full sync for ${calendarId}:`, error);
  }
}

async function syncCalendarChanges(syncToken, calendarId) {
  const auth = await authorize();
  const calendar = google.calendar({ version: 'v3', auth });

  const now = new Date();
  const sixMonthsLater = new Date();
  sixMonthsLater.setMonth(now.getMonth() + 6);

  try {
    // 1. Pull change logs delta cleanly (No forbidden time parameters allowed)
    const response = await calendar.events.list({
      calendarId: calendarId,
      syncToken: syncToken,
    });

    const eventsToProcess = [];

    for (const event of response.data.items) {
      // Deletions MUST progress to processEvents regardless of dates
      if (event.status === 'cancelled') {
        eventsToProcess.push(event);
        continue;
      }

      // Ensure active elements fit our structural local caching window
      const eventEnd = event.end?.dateTime || event.end?.date;
      if (eventEnd && new Date(eventEnd) < sixMonthsLater) {
        eventsToProcess.push(event);
      }
    }

    console.log(`[syncCalendarChanges] Sync Delta: Received ${response.data.items.length}, passing ${eventsToProcess.length} downstream.`);

    if (response.data.nextSyncToken) {
      await storeSyncToken(response.data.nextSyncToken, calendarId);
    }

    await processEvents(eventsToProcess, calendarId);

  } catch (error) {
    if (error.code === 410) {
      console.warn(`⚠️ Sync token expired for ${calendarId}. Re-aligning baselines...`);
      await fullCalendarSync(calendarId);
    } else {
      console.error(`❌ Error syncing data changes for ${calendarId}:`, error);
    }
  }
}

async function syncAllCalendarsOnStartup() {
  console.log("🚀 Starting initialization sequence on server startup...");
  
  // Clean tables completely to remove stale states
  await pool.query("TRUNCATE TABLE events");
  await pool.query("TRUNCATE TABLE google_sync_tokens"); 

  const calendarIds = [PENDING_APPROVAL_CALENDAR_ID, APPROVED_CALENDAR_ID, PROPOSED_CHANGES_CALENDAR_ID];

  for (const calendarId of calendarIds) {
    await stopExistingWatches(calendarId);
    await fullCalendarSync(calendarId);
  }

  console.log("📋 Initial setup complete. Local caches fully populated.");
}

// =========================================================================
// 3. DATABASE TRANSLATION & STORAGE LAYERS
// =========================================================================

async function storeSyncToken(syncToken, calendarId) {
  await pool.query(
    `INSERT INTO google_sync_tokens (calendar_id, sync_token, updated_at)
     VALUES ($1, $2, NOW())
     ON CONFLICT (calendar_id) DO UPDATE SET sync_token = EXCLUDED.sync_token, updated_at = NOW()`,
    [calendarId, syncToken]
  );
}

async function getStoredSyncToken(calendarId) {
  const result = await pool.query(`SELECT sync_token FROM google_sync_tokens WHERE calendar_id = $1`, [calendarId]);
  return result.rows[0]?.sync_token || null;
}

async function storeEvents(eventList, calendarId) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    for (const event of eventList) {
      if (event.status === 'confirmed') {
        const { id: eventId, start, end, recurrence, attendees, extendedProperties, summary } = event;

        // Fallbacks for all-day events vs standard dateTimes
        const startTime = new Date(start.dateTime || start.date).toISOString();
        const endTime = new Date(end.dateTime || end.date).toISOString();
        const recurrenceRule = recurrence ? recurrence.join(';') : null;

        let rooms = [];
        
        if (extendedProperties?.private?.rooms) {
          try {
            const parsed = JSON.parse(extendedProperties.private.rooms);
            rooms = Array.isArray(parsed) 
              ? parsed.map(r => typeof r === 'string' ? r : r.email).filter(Boolean)
              : [];
          } catch (e) {
            rooms = [];
          }
        }
        
        if (rooms.length === 0 && attendees) {
          rooms = attendees.filter(a => a.resource === true).map(a => a.email);
        }
        
        if (rooms.length === 0 && calendarId) {
          rooms = [calendarId];
        }

        await client.query(
          `INSERT INTO events (event_id, calendar_id, start_time, end_time, recurrence_rule, rooms, updated_at)
           VALUES ($1, $2, $3, $4, $5, $6, NOW())
           ON CONFLICT (event_id) DO UPDATE
           SET start_time = EXCLUDED.start_time,
               end_time = EXCLUDED.end_time,
               recurrence_rule = EXCLUDED.recurrence_rule,
               rooms = EXCLUDED.rooms,
               updated_at = NOW()`, 
          [eventId, calendarId, startTime, endTime, recurrenceRule, rooms]
        );
      }
    }
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    console.error("❌ Error running storeEvents batch block:", error);
  } finally {
    client.release();
  }
}

async function processEvents(events, calendarId) {
  const auth = await authorize();
  const calendar = google.calendar({ version: 'v3', auth });

  const now = new Date();
  const sixMonthsLater = new Date();
  sixMonthsLater.setMonth(now.getMonth() + 6);

  let expandedEvents = [];
  let cancelledEventIds = [];

  for (const event of events) {
    // Read clean, readable names or provide fallbacks if they are blank
    const eventTitle = event.summary || "Untitled Event";
    const creator = event.creator?.email || "Unknown Creator";

    // 1. Handle Deletions Immediately
    if (event.status === 'cancelled') {
      console.log(`[processEvents] 🗑️ Found cancellation for Event ID: ${event.id}`);
      cancelledEventIds.push(event.id);
      continue;
    }

    // 2. Safely Cap Recurring Event Expansion
    if (event.recurrence) {
      const rrule = event.recurrence.join('; ');
      try {
        const instancesResponse = await calendar.events.instances({
          calendarId: calendarId,
          eventId: event.id,
          timeMin: now.toISOString(),
          timeMax: sixMonthsLater.toISOString(),
          singleEvents: true
        });

        const count = instancesResponse.data.items.length;
        console.log(`[processEvents] 🔄 Expanded ${count} instances in next 6 mos for: "${eventTitle}" (By: ${creator} | Rule: ${rrule})`);
        
        expandedEvents.push(...instancesResponse.data.items);
      } catch (error) {
        console.error(`❌ Error expanding instances for "${eventTitle}" (${event.id}):`, error);
      }
    } else {
      // 3. For single events, verify they fall within the 6-month window before storing
      const eventEnd = event.end?.dateTime || event.end?.date;
      if (eventEnd && new Date(eventEnd) < sixMonthsLater) {
        expandedEvents.push(event);
      }
    }
  }

  // 4. Execute deletions using exact structural column naming conventions
  if (cancelledEventIds.length > 0) {
    console.log(`[processEvents] 🗑️ Removing ${cancelledEventIds.length} cancelled IDs from local cache.`);
    await deleteEventsFromDB(cancelledEventIds, calendarId); 
  }

  // 5. Commit modifications/additions
  if (expandedEvents.length > 0) {
    await storeEvents(expandedEvents, calendarId);
  }
}

async function deleteEventsFromDB(eventIds, calendarId) {
  try {
    // Aligned with the correct table name 'events' and column name 'event_id'
    await pool.query(
      `DELETE FROM events WHERE event_id = ANY($1) AND calendar_id = $2`,
      [eventIds, calendarId]
    );
  } catch (error) {
    console.error("❌ Database deletion step failed:", error);
  }
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
};