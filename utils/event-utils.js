const { authorize } = require('./authorize'); // Assuming you have an authorize function
const { RRule, RRuleSet, rrulestr } = require("rrule");
const { google } = require('googleapis');
const { DateTime } = require('luxon');
const pool = require('../db')
require('dotenv').config()

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
    console.error('Error fetching pending events:', error.message);
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
  console.log("userAttendee: ", userAttendee);
  const userEmail = userAttendee?.email || "No email provided";
  const userName = event.creator?.displayName || "User"; // TODO: use req.session.user to fill this because google does not store the name in the attendees property. OR store name somewhere else that I can read it XD
  const eventName = event.summary || "No event name";
  const eventStart = event.start.dateTime;
  const eventEnd = event.start.dateTime;
  console.log(event.extendedProperties.private);
  const roomNames = JSON.parse(event.extendedProperties?.private?.rooms || event.attendees.filter((room) => room.resource === true)).map(
    (room) => room.email || "Unknown Room"
  );

  console.log("extracted data:", userEmail, userName, eventName, eventStart, eventEnd, roomNames);
  return { userEmail, userName, eventName, eventStart, eventEnd, roomNames };
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
 * Check for conflicts between an incoming event and stored events in the database.
 * @param {Array} roomList - a list of calendarIDs associated with the event
 * @param {String} startDateTime - ISO dateTime string
 * @param {String} endDateTime - ISO dateTime string
 * @param {String} recurrenceRule - rRule
 * @returns {Array} List of conflicting events.
 */
async function checkForConflicts(roomList, startDateTime, endDateTime, recurrenceRule) {
  if (!startDateTime || !endDateTime || !roomList || roomList.length === 0) {
    throw new Error("Event must include start time, end time, and rooms.");
  }

  // Expand recurring events into individual instances if applicable
  let eventInstances = [{ start: startDateTime, end: endDateTime }];

  if (recurrenceRule && recurrenceRule !== 'FREQ=') {
    eventInstances = expandRecurringEvent(startDateTime, endDateTime, recurrenceRule);
  }

  try {
    // Base query to check for conflicts
    let query = `
      SELECT * FROM events
      WHERE rooms && $1 -- Check if any of the provided rooms overlap with stored event rooms
      AND (
    `;

    // Dynamically generate conflict conditions for each instance
    const conditions = eventInstances.map((_, index) => `(start_time < $${index * 2 + 2} AND end_time > $${index * 2 + 3})`);
    query += conditions.join(" OR ") + ")";

    // Query parameters: First parameter is the room list, then start and end times
    const queryParams = [
      roomList, // First parameter: an array of room calendar IDs
      ...eventInstances.flatMap(({ start, end }) => [start, end]), // Insert start & end times dynamically
    ];

    const { rows } = await pool.query(query, queryParams);
    return rows; // Return list of conflicting events
  } catch (error) {
    console.error("Error checking conflicts:", error);
    throw error;
  }
}




module.exports = {
  getNumPendingEvents,
  extractEventDetailsForEmail,
  checkForConflicts,
};
