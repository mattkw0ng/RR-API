const { authorize } = require('./authorize'); // Assuming you have an authorize function
const { RRule, RRuleSet, rrulestr } = require("rrule");
const { google } = require('googleapis');
const { DateTime } = require('luxon');
const roomsTools = require('../rooms');
const pool = require('../db')
require('dotenv').config()
const log = require('./log');

// Constants for your calendar IDs
const PENDING_APPROVAL_CALENDAR_ID = process.env.PENDING_APPROVAL_CALENDAR_ID;
const PROPOSED_CHANGES_CALENDAR_ID = process.env.PROPOSED_CHANGES_CALENDAR_ID;
const APPROVED_CALENDAR_ID = process.env.APPROVED_CALENDAR_ID;

/**
 * Fetch all pending events from the pending and proposed calendars.
 * @returns {Promise<number>} - Total number of pending events.
 */
const getNumPendingEvents = async () => {
  try {
    const auth = await authorize();
    const calendar = google.calendar({ version: 'v3', auth });
    const now = new Date();

    const pendingCalendar = await calendar.events.list({
      calendarId: PENDING_APPROVAL_CALENDAR_ID,
      singleEvents: false,
      timeMin: now.toISOString(),
    });

    const proposedCalendar = await calendar.events.list({
      calendarId: PROPOSED_CHANGES_CALENDAR_ID,
      singleEvents: false,
      timeMin: now.toISOString(),
    });

    const pendingCalendarEvents = pendingCalendar.data.items || [];
    const proposedCalendarEvents = proposedCalendar.data.items.filter(
      (e) => e.extendedProperties?.private?.adminApproval === true
    );

    return pendingCalendarEvents.length + proposedCalendarEvents.length;
  } catch (error) {
    log.error('Error fetching pending events:', error.message);
    throw new Error('Failed to fetch pending events');
  }
};

/**
 * get event by id from database
 */
const getEventById = async (eventId) => {
  try {
    const query = `
      SELECT id, start_time, end_time, rooms
      FROM events
      WHERE event_id = $1
    `;
    const { rows } = await pool.query(query, [eventId]);

    if (rows.length === 0) {
      return { error: "Event not found" };
    }

    const event = rows[0];
    
    // Log details to the server console for quick inspection
    console.log(`--- Debugging Event: ${event.summary} ---`);
    console.log(`Start (Raw DB): ${event.start_time}`);
    console.log(`End (Raw DB): ${event.end_time}`);
    console.log(`Rooms: ${event.rooms}`);

    return event;
  } catch (error) {
    log.error("Debug Fetch Error:", error);
    throw new Error("Failed to fetch event for debugging.");
  }
}

const submitQuery = async (queryString, queryParams) => {
  try {
    console.log("[queryEvents]", queryString, queryParams);
    const { rows } = await pool.query(queryString, queryParams);
    return rows;
  } catch (error) {
    log.error("Debug Fetch Error:", error);
    throw new Error("Failed to fetch event for debugging.");
  }
}

/**
 * Extract various details from the event object that are required for the email functions
 * @param {Object} event - The new event
 * @returns {Object} Contains userEmail, userName, eventName, eventStart, eventEnd, roomNames 
 */
const extractEventDetailsForEmail = async (event) => {
  if (!event) {
    throw new Error("Invalid event object");
  }

  const userAttendee = event.attendees?.find((attendee) => attendee.email && !attendee.resource);
  log.info("userAttendee: ", userAttendee);
  const userEmail = userAttendee?.email || "No email provided";
  const userName = event.creator?.displayName || "User"; // TODO: use req.session.user to fill this because google does not store the name in the attendees property. OR store name somewhere else that I can read it XD
  const eventName = event.summary || "No event name";
  const eventStart = event.start.dateTime;
  const eventEnd = event.end.dateTime;
  const htmlLink = event.htmlLink || "No link provided";
  log.info(event.extendedProperties?.private);
  // const roomNames = JSON.parse(event.extendedProperties?.private?.rooms || event.attendees.filter((room) => room.resource === true)).map(
  //   (room) => room.email || "Unknown Room"
  // );
  const roomNames = await roomsTools.NormalizeRoomList(event.extendedProperties?.private?.rooms);
  log.info("Extracted room names:", roomNames);
  const recurrence = event.recurrence ? event.recurrence[0] : null;

  log.info("extracted data:", userEmail, userName, eventName, eventStart, eventEnd, roomNames, htmlLink, recurrence);
  return { userEmail, userName, eventName, eventStart, eventEnd, roomNames, htmlLink, recurrence };
};

/**
 * Expands a recurring event into its individual instances.
 * @param {String} start - ISO dateTime string
 * @param {String} end - ISO dateTime string
 * @param {String} recurrenceRule - rRule
 * @returns {Array} List of expanded event instances with start & end times.
 */
function expandRecurringEvent(start, end, recurrenceRule) {
  if (!recurrenceRule) {
    return [{ start: start, end: end }]; // Return single instance for non-recurring events
  }

  const rule = rrulestr(recurrenceRule, {
    dtstart: new Date(start),
  });

  const sixMonthsFromNow = DateTime.now().plus({ months: 6 }).toJSDate();

  // Generate all instances up to 6 months ahead
  const occurrences = rule.between(new Date(start), sixMonthsFromNow);

  // Compute each instance's end time by adding the original duration
  const duration = DateTime.fromISO(end).diff(DateTime.fromISO(start));

  return occurrences.map((instance) => {
    const instanceStart = DateTime.fromJSDate(instance).toISO();
    const instanceEnd = DateTime.fromJSDate(instance).plus(duration).toISO();
    return { start: instanceStart, end: instanceEnd };
  });
}

/**
 * Translates list of events into a list of rooms and their currently occupied dateTimes
 * @param {Array} events - list of events taken from database
 * @returns {Array} List of rooms and time ranges
 */
function groupEventsByRoom(events) {
  const roomMap = new Map();

  events.forEach(event => {
    log.info("Conflict Event found", event);
    event.rooms.forEach(room => {
      if (!roomMap.has(room)) {
        roomMap.set(room, { room, times: [] });
      }
      roomMap.get(room).times.push({ start: event.start_time, end: event.end_time });
    });
  });

  return Array.from(roomMap.values());
}

/**
 * Given a list of room objects with calendar IDs, returns an array of corresponding room names.
 * @param {Array} busyRooms - Array of objects like [{ room: calendarId, times: [...] }, ...]
 * @returns {Promise<Array>} List of room names
 */
async function getRoomNamesFromCalendarIds(busyRooms) {
  const calendarIds = busyRooms.map(r => r.room);

  if (!calendarIds.length) return [];

  try {
    const query = `
      SELECT room_name, calendar_id
      FROM rooms
      WHERE calendar_id = ANY($1)
    `;

    const { rows } = await pool.query(query, [calendarIds]);

    // Create a lookup map from calendar_id to room_name
    const idToNameMap = Object.fromEntries(rows.map(({ room_name, calendar_id }) => [calendar_id, room_name]));

    // Map the original order
    const roomNames = busyRooms.map(roomObj => idToNameMap[roomObj.room]).filter(Boolean);
    log.info("(getRoomNamesFromCalendarIds) Room names:", roomNames);
    return roomNames;
  } catch (error) {
    log.error("Error fetching room names:", error);
    throw error;
  }
}


/**
 * Helper: Query database for conflicts (fast lookup)
 */
async function queryDatabaseConflicts(roomList, eventInstances) {
  try {
    const instanceConditions = eventInstances.map((_, index) => `
      (
        (start_time < $${index * 2 + 2} AND end_time > $${index * 2 + 3})
        OR (start_time >= $${index * 2 + 2} AND start_time < $${index * 2 + 3})
        OR (end_time > $${index * 2 + 2} AND end_time <= $${index * 2 + 3})
        OR (start_time <= $${index * 2 + 2} AND end_time >= $${index * 2 + 3})
      )
    `).join(" OR ");

    const query = `
      SELECT * FROM events
      WHERE rooms && $1
      AND (${instanceConditions})
    `;

    const values = [roomList, ...eventInstances.flatMap(({ start, end }) => [start, end])];
    const { rows } = await pool.query(query, values);
    
    return rows;
  } catch (error) {
    log.error("Error querying database for conflicts:", error);
    throw error;
  }
}

/**
 * Helper: Check Google Calendar API directly for conflicts
 * This is our "source of truth" check
 */
async function checkGoogleCalendarDirect(roomList, eventInstances) {
  try {
    if (!roomList || roomList.length === 0) return [];

    const auth = await authorize();
    const calendar = google.calendar({ version: 'v3', auth });

    const conflictEvents = [];

    // Check each room calendar for conflicts
    for (const roomId of roomList) {
      try {
        for (const instance of eventInstances) {
          const response = await calendar.events.list({
            calendarId: roomId,
            timeMin: instance.start,
            timeMax: instance.end,
            singleEvents: true,
            showDeleted: false,
          });

          if (response.data.items && response.data.items.length > 0) {
            conflictEvents.push(...response.data.items.map(event => ({
              ...event,
              _roomId: roomId,
              _foundVia: 'google_api'
            })));
          }
        }
      } catch (error) {
        log.warn(`[checkGoogleCalendarDirect] Error checking room ${roomId}:`, error.message);
        // Don't fail entire check if one room fails
      }
    }

    return conflictEvents;
  } catch (error) {
    log.error("Error checking Google Calendar API:", error);
    throw error;
  }
}

/**
 * Helper: Sync Google events back to database if they were missed
 */
async function syncMissingEventsToDB(googleEvents, roomList) {
  try {
    if (googleEvents.length === 0) return;

    const { storeEvents } = require('./webhook-utils');
    
    // Only sync confirmed events
    const confirmedEvents = googleEvents.filter(e => e.status === 'confirmed');
    
    if (confirmedEvents.length > 0) {
      log.warn(`[syncMissingEventsToDB] Syncing ${confirmedEvents.length} missed events to database...`);
      
      // Sync to all affected calendars
      for (const roomId of roomList) {
        const roomEvents = confirmedEvents.filter(e => 
          e.attendees?.some(a => a.email === roomId && a.resource === true)
        );
        
        if (roomEvents.length > 0) {
          await storeEvents(roomEvents, roomId);
        }
      }
    }
  } catch (error) {
    log.error("[syncMissingEventsToDB] Error syncing missing events:", error);
    // Don't throw - this is a secondary operation
  }
}

/**
 * Main conflict check: HYBRID approach (Database + API verification)
 * 
 * STRATEGY:
 * 1. Fast path: Query database (99% of time, instant)
 * 2. Verification: If conflicts found, verify with API
 * 3. Catch-all: If no DB conflicts, check API for missed events
 * 
 * This gives us speed + accuracy without sacrificing too much performance.
 * 
 * @param {Array} roomList - a list of calendarIDs associated with the event
 * @param {String} startDateTime - ISO dateTime string
 * @param {String} endDateTime - ISO dateTime string
 * @param {String} recurrenceRule - rRule
 * @returns {Array} List of conflicting events (from database, verified with API if needed).
 */
async function checkForConflicts(roomList, startDateTime, endDateTime, recurrenceRule) {
  if (!startDateTime || !endDateTime) {
    throw new Error("Event must include start time and end time.");
  }

  let eventInstances = [{ start: startDateTime, end: endDateTime }];

  // Expand recurring events into separate instances
  if (recurrenceRule && !recurrenceRule.includes('FREQ=;UNTIL') && recurrenceRule !== 'null') {
    const expandedInstances = expandRecurringEvent(startDateTime, endDateTime, recurrenceRule);
    eventInstances = [...eventInstances, ...expandedInstances];
  }

  log.info('>> Expanded event instances:', eventInstances);

  try {
    // Normalize room list
    if (!roomList || roomList.length === 0) {
      const { rows: allRooms } = await pool.query(`SELECT calendar_id FROM rooms`);
      roomList = allRooms.map(row => row.calendar_id);
    }

    log.info(`[checkForConflicts] Checking ${roomList.length} rooms for conflicts`);

    // ========================================
    // STEP 1: Fast database lookup
    // ========================================
    const dbConflicts = await queryDatabaseConflicts(roomList, eventInstances);
    log.info(`[checkForConflicts] Database found ${dbConflicts.length} conflicts`);

    // ========================================
    // STEP 2: If conflicts found, they're likely accurate
    // but verify with API to catch any database corruption
    // ========================================
    if (dbConflicts.length > 0) {
      try {
        const googleConflicts = await checkGoogleCalendarDirect(roomList, eventInstances);
        
        if (googleConflicts.length < dbConflicts.length) {
          log.warn(`[checkForConflicts] ⚠️  DATABASE HAD FALSE POSITIVES: DB said ${dbConflicts.length} conflicts but Google only has ${googleConflicts.length}`);
        } else if (googleConflicts.length > dbConflicts.length) {
          log.warn(`[checkForConflicts] ⚠️  DATABASE MISSED EVENTS: DB had ${dbConflicts.length} but Google has ${googleConflicts.length}`);
          // Sync the missing ones
          await syncMissingEventsToDB(googleConflicts, roomList);
        }
        
        // Return database results (they're more likely to be correct and have our normalized data)
        return groupEventsByRoom(dbConflicts);
      } catch (error) {
        log.error("[checkForConflicts] API verification failed, using database results:", error.message);
        return groupEventsByRoom(dbConflicts);
      }
    }

    // ========================================
    // STEP 3: No DB conflicts found
    // But check if Google Calendar has conflicts we missed
    // This catches sync failures and edge cases
    // ========================================
    log.info("[checkForConflicts] No database conflicts found, checking Google Calendar for missed events...");
    
    try {
      const googleConflicts = await checkGoogleCalendarDirect(roomList, eventInstances);
      
      if (googleConflicts.length > 0) {
        log.warn(`[checkForConflicts] ⚠️  FOUND ${googleConflicts.length} CONFLICTS IN GOOGLE NOT IN DATABASE!`);
        log.warn("[checkForConflicts] Database appears out of sync. Syncing now...");
        
        // Sync these back to database for future checks
        await syncMissingEventsToDB(googleConflicts, roomList);
        
        // Return the Google Calendar results
        return googleConflicts.map(event => ({
          room: event._roomId,
          times: [{ start: event.start.dateTime, end: event.end.dateTime }]
        }));
      }
      
      log.info("[checkForConflicts] No conflicts found (database verified with API)");
      return [];
    } catch (error) {
      log.error("[checkForConflicts] API check failed:", error.message);
      // If API fails, trust database (better to be lenient than crash)
      log.info("[checkForConflicts] Falling back to database results");
      return [];
    }

  } catch (error) {
    log.error("Error checking conflicts:", error);
    throw new Error("Failed to check for conflicts.");
  }
}

/**
 * Get all available rooms that are unoccupied during the given time range.
 * @param {String} startDateTime - ISO dateTime string
 * @param {String} endDateTime - ISO dateTime string
 * @param {String} recurrenceRule - Optional rRule
 * @returns {Array} List of available room records.
 */
async function getAvailability(startDateTime, endDateTime, recurrenceRule) {
  if (!startDateTime || !endDateTime) {
    throw new Error("Missing start or end datetime.");
  }

  let eventInstances = [{ start: startDateTime, end: endDateTime }];

  if (recurrenceRule && recurrenceRule !== 'FREQ=' && recurrenceRule !== 'null') {
    const expandedInstances = expandRecurringEvent(startDateTime, endDateTime, recurrenceRule);
    eventInstances = [...eventInstances, ...expandedInstances];
  }

  try {
    // Generate conditions for time conflict checks
    const instanceConditions = eventInstances.map((_, index) => `
      (
        (start_time < $${index * 2 + 1} AND end_time > $${index * 2 + 2})
        OR (start_time >= $${index * 2 + 1} AND start_time < $${index * 2 + 2})
        OR (end_time > $${index * 2 + 1} AND end_time <= $${index * 2 + 2})
        OR (start_time <= $${index * 2 + 1} AND end_time >= $${index * 2 + 2})
      )
    `).join(" OR ");

    // Flatten dates for SQL values
    const dateValues = eventInstances.flatMap(({ start, end }) => [start, end]);

    const conflictQuery = `
      SELECT DISTINCT UNNEST(rooms) AS busy_room
      FROM events
      WHERE ${instanceConditions}
    `;

    const conflictResult = await pool.query(conflictQuery, dateValues);
    const busyRooms = conflictResult.rows.map(row => row.busy_room);

    // Now fetch all rooms that are NOT in the busy list
    const availableRoomsQuery = `
      SELECT * FROM rooms
      WHERE calendar_id != ALL($1)
    `;

    const { rows: availableRoomRows } = await pool.query(availableRoomsQuery, [busyRooms]);
    const availableRoomNames = availableRoomRows.map(row => row.room_name);

    return availableRoomNames;
  } catch (error) {
    log.error("Error finding available rooms:", error);
    throw error;
  }
}

// Get the calendar IDs for the rooms (assuming you have a function to fetch them)
async function generateRoomsAttendeesList(rooms) {

  if (detectRoomsFormat(rooms) === "objectArray") { // if the format is already objectArray, do nothing
    log.info("Room list is already in objectArray format, no need to regenerate attendees.");
    return rooms;
  } else if (detectRoomsFormat(rooms) === "stringArray") { // if the format is stringArray, convert to objectArray
    log.info("Room list is in stringArray format, converting to objectArray.");

    const roomAttendees = await Promise.all(
      rooms.map(async (room) => {
        const roomId = await roomsTools.GetCalendarIdByRoom(room);
        return { email: roomId, resource: true };
      })
    );
    log.info(`roomAttendees Stringified: ${roomAttendees}`);
    return roomAttendees;
  } else {
    console.warn("Room list format is unrecognized, proceeding without changes.");
    throw new Error("Room list format is unrecognized, cannot generate attendees.");
  }
}

function detectRoomsFormat(rooms) {
  if (Array.isArray(rooms)) {
    if (rooms.length === 0) return 'unknown';
    if (typeof rooms[0] === 'object' && rooms[0] !== null && 'email' in rooms[0]) {
      return 'objectArray'; // [{"email":..., "resource":...}]
    }
    if (typeof rooms[0] === 'string') {
      return 'stringArray'; // ["A201", "Sanctuary"]
    }
  }
  return 'unknown';
}


module.exports = {
  getNumPendingEvents,
  extractEventDetailsForEmail,
  checkForConflicts,
  getAvailability,
  getRoomNamesFromCalendarIds,
  generateRoomsAttendeesList,
  detectRoomsFormat,
  getEventById,
  submitQuery,
};
