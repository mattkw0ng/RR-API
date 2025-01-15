const { authorize } = require('./authorize'); // Assuming you have an authorize function
const { google } = require('googleapis');
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

const extractEventDetailsForEmail = (event) => {
  if (!event) {
    throw new Error("Invalid event object");
  }

  const userAttendee = event.attendees?.find((attendee) => attendee.email && !attendee.resource);
  console.log("userAttendee: ", userAttendee);
  const userEmail = userAttendee?.email || "No email provided";
  const userName = event.creator?.displayName || "User"; // TODO: use req.session.user to fill this because google does not store the name in the attendees property. OR store name somewhere else that I can read it XD
  const eventName = event.summary || "No event name";
  const eventDate = new Date(event.start.dateTime).toLocaleDateString("en-US", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  });
  const eventTime = `${new Date(event.start.dateTime).toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
  })} - ${new Date(event.end.dateTime).toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
  })}`;
  console.log(event.extendedProperties.private);
  const roomNames = JSON.parse(event.extendedProperties?.private?.rooms || "[]").map(
    (room) => room.displayName || "Unknown Room"
  );

  console.log("extracted data:", userEmail, userName, eventName, eventDate, eventTime, roomNames);
  return { userEmail, userName, eventName, eventDate, eventTime, roomNames };
};




module.exports = {
  getNumPendingEvents,
  extractEventDetailsForEmail,
};
