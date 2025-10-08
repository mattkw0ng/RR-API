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
 * Extract various details from the event object that are required for the email functions
 * @param {Object} event - The new event
 * @returns {Object} Contains userEmail, userName, eventName, eventStart, eventEnd, roomNames 
 */
const extractEventDetailsForEmail = (event) => {
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
  log.info(event.extendedProperties.private);
  const roomNames = JSON.parse(event.extendedProperties?.private?.rooms || event.attendees.filter((room) => room.resource === true)).map(
    (room) => room.email || "Unknown Room"
  );
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
 * Check for conflicts between an incoming event and stored events in the database.
 * @param {Array} roomList - a list of calendarIDs associated with the event
 * @param {String} startDateTime - ISO dateTime string
 * @param {String} endDateTime - ISO dateTime string
 * @param {String} recurrenceRule - rRule
 * @returns {Array} List of conflicting events.
 */
async function checkForConflicts(roomList, startDateTime, endDateTime, recurrenceRule) {
  if (!startDateTime || !endDateTime) {
    throw new Error("Event must include start time and end time.");
  }

  let eventInstances = [{ start: startDateTime, end: endDateTime }]; // Default for non-recurring events

  // Expand recurring events into separate instances
  if (recurrenceRule && !recurrenceRule.includes('FREQ=;UNTIL') && recurrenceRule !== 'null') {
    const expandedInstances = expandRecurringEvent(startDateTime, endDateTime, recurrenceRule);
    eventInstances = [...eventInstances, ...expandedInstances];
  }

  log.info('>> Expanded event instances:', eventInstances);

  try {
    // If roomList is empty, fetch all possible rooms from the database
    if (!roomList || roomList.length === 0) {
      const { rows: allRooms } = await pool.query(`SELECT calendar_id FROM rooms`);
      roomList = allRooms.map(row => row.calendar_id);
    }

    // Generate query conditions for each instance
    const instanceConditions = eventInstances.map((_, index) => `
      (
        (start_time < $${index * 2 + 2} AND end_time > $${index * 2 + 3}) -- Standard conflict check
        OR (start_time >= $${index * 2 + 2} AND start_time < $${index * 2 + 3}) -- New event starts inside existing event
        OR (end_time > $${index * 2 + 2} AND end_time <= $${index * 2 + 3}) -- New event ends inside existing event
        OR (start_time <= $${index * 2 + 2} AND end_time >= $${index * 2 + 3}) -- New event fully overlaps existing event
      )
    `).join(" OR ");

    // SQL query to find conflicting events
    const query = `
      SELECT * FROM events
      WHERE rooms && $1 -- Check if any room overlaps
      AND (${instanceConditions}) -- Check for time conflicts
    `;

    // Flatten event instances into query parameters
    const values = [roomList, ...eventInstances.flatMap(({ start, end }) => [start, end])];

    // Execute the query
    const { rows } = await pool.query(query, values);

    // Group conflicts by room
    return groupEventsByRoom(rows);
  } catch (error) {
    log.error("Error checking conflicts:", error);
    throw new Error("Failed to check for conflicts in the database.");
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
};
