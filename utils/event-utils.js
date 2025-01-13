const { authorize } = require('./authorize'); // Assuming you have an authorize function
const { google } = require('googleapis');
const { sendEmail } = require('./sendEmailSG');
const ADMIN_EMAILS = ['matt.kwong@sjcac.org', 'audrey.kwong@sjcac.org', 'churchoffice@sjcac.org']; // Replace with actual admin emails

// Constants for your calendar IDs
const PENDING_APPROVAL_CALENDAR_ID = 'your-pending-calendar-id@group.calendar.google.com';
const PROPOSED_CHANGES_CALENDAR_ID = 'your-proposed-calendar-id@group.calendar.google.com';

/**
 * Fetch all pending events from the pending and proposed calendars.
 * @returns {Promise<number>} - Total number of pending events.
 */
const getPendingEvents = async () => {
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
 * Notify admins about a new room reservation request.
 * @param {object} newEvent - The new room reservation request.
 * @returns {Promise<void>}
 */
const notifyAdminsOfNewRequest = async (newEvent) => {
  try {
    // Fetch the total number of pending events
    const numPendingEvents = await getPendingEvents();

    // Extract details of the new event
    const eventDetails = `
      <p><strong>Event Name:</strong> ${newEvent.summary}</p>
      <p><strong>Date:</strong> ${new Date(newEvent.start.dateTime).toLocaleDateString('en-US', {
        weekday: 'long',
        year: 'numeric',
        month: 'long',
        day: 'numeric',
      })}</p>
      <p><strong>Time:</strong> ${new Date(newEvent.start.dateTime).toLocaleTimeString([], {
        hour: '2-digit',
        minute: '2-digit',
      })} - ${new Date(newEvent.end.dateTime).toLocaleTimeString([], {
        hour: '2-digit',
        minute: '2-digit',
      })}</p>
      <p><strong>Rooms:</strong> ${JSON.parse(newEvent.extendedProperties.private.rooms)
        .map((room) => room.displayName)
        .join(', ')}</p>
      <p><strong>Description:</strong> ${newEvent.description || 'No description provided'}</p>
    `;

    // Email content
    const subject = `New Room Reservation Request: ${newEvent.summary}`;
    const text = `A new room reservation request has been submitted. Total pending events: ${numPendingEvents}`;
    const html = `
      <p>Dear Admins,</p>
      <p>A new room reservation request has been submitted:</p>
      ${eventDetails}
      <p><strong>Total Pending Events:</strong> ${numPendingEvents}</p>
      <p>Please log in to review and take action.</p>
      <p>Thank you,</p>
      <p><strong>SJCAC Room Reservation Team</strong></p>
    `;

    // Send email to all admins
    await Promise.all(
      ADMIN_EMAILS.map((email) =>
        sendEmail(email, subject, text, html)
      )
    );

    console.log('Notification email sent to admins.');
  } catch (error) {
    console.error('Error notifying admins:', error.message);
    throw new Error('Failed to notify admins');
  }
};

module.exports = {
  notifyAdminsOfNewRequest,
};
