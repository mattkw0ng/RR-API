const sgMail = require('@sendgrid/mail');
const { getNumPendingEvents } = require('./event-utils')
const { DateTime } = require('luxon');
require('dotenv').config()

// Set SendGrid API Key
sgMail.setApiKey(process.env.SENDGRID_API_KEY);

/**
 * Reusable function to send an email using SendGrid
 * @param {string} toEmail - The recipient's email address
 * @param {string} subject - The subject of the email
 * @param {string} text - Plain text version of the email content
 * @param {string} html - HTML version of the email content
 * @returns {Promise<void>}
 */
const sendEmail = async (toEmail, subject, text, html) => {
  const msg = {
    to: toEmail,
    from: 'rooms@sjcac.org', // Your verified sender email
    subject,
    text,
    html,
  };

  try {
    await sgMail.send(msg);
    console.log(`Email sent to ${toEmail}`);
  } catch (error) {
    console.error('Error sending email:', error);
    throw new Error('Email delivery failed');
  }
};

// Email templates

/**
 * Notify user their room reservation request has been received.
 */
const sendReservationReceivedEmail = async (userEmail, userName, eventName, eventDateTimeStart, eventDateTimeEnd, roomNames) => {
  const startTime = DateTime.fromISO(eventDateTimeStart, { zone: 'America/Los_Angeles' });
  const endTime = DateTime.fromISO(eventDateTimeEnd, { zone: 'America/Los_Angeles' });

  const eventDate = startTime.toLocaleString(DateTime.DATE_FULL); // e.g., "Monday, January 15, 2025"
  const eventTime = `${startTime.toLocaleString(DateTime.TIME_SIMPLE)} - ${endTime.toLocaleString(DateTime.TIME_SIMPLE)}`;

  await sendEmail(
    userEmail,
    'Your Room Reservation Request has been Received',
    'Your room reservation request has been received. You will be notified upon further updates.',
    `
      <p>Dear ${userName},</p>
      <p>We have received your room reservation request for <strong>${eventName}</strong>.</p>
      <p>Details:</p>
      <ul>
        <li><strong>Date:</strong> ${eventDate}</li>
        <li><strong>Time:</strong> ${eventTime}</li>
        <li><strong>Room(s):</strong> ${roomNames.join(', ')}</li>
      </ul>
      <p>You will be notified via email when your reservation is approved. You can check real time status by logging into your account and clicking on 'profie' to view pending, approved and a history of your requests.</p>
      <small>Note: You may recieve an email titled 'Invitation from an unknown sender:'. Do not be alarmed, this is an automated message from Google notifying you that you have been added as an attendee to this calendar event.</small>
      <p>Thank you,</p>
      <p><strong>SJCAC Room Reservation Team</strong></p>
    `
  );
};

/**
 * Notify user their room reservation request has been approved.
 */
const sendReservationApprovedEmail = async (userEmail, userName, eventName, eventDateTimeStart, eventDateTimeEnd, roomNames) => {
  const startTime = DateTime.fromISO(eventDateTimeStart, { zone: 'America/Los_Angeles' });
  const endTime = DateTime.fromISO(eventDateTimeEnd, { zone: 'America/Los_Angeles' });

  const eventDate = startTime.toLocaleString(DateTime.DATE_FULL); // e.g., "Monday, January 15, 2025"
  const eventTime = `${startTime.toLocaleString(DateTime.TIME_SIMPLE)} - ${endTime.toLocaleString(DateTime.TIME_SIMPLE)}`;

  await sendEmail(
    userEmail,
    'Your Room Reservation Request has been Approved',
    'Your room reservation request has been approved.',
    `
      <p>Dear ${userName},</p>
      <p>Your room reservation request for <strong>${eventName}</strong> has been approved.</p>
      <p>Details:</p>
      <ul>
        <li><strong>Date:</strong> ${eventDate}</li>
        <li><strong>Time:</strong> ${eventTime}</li>
        <li><strong>Room(s):</strong> ${roomNames.join(', ')}</li>
      </ul>

      <hr />
      <h3>Reminders for New Room Reservations & Usage</h3>
      <p>As the requester of the room reservation, you are responsible for the following:</p>
      <ol>
        <li>Access to the church campus / room: If you are not a church key-holder, make sure someone can unlock the doors for you (e.g. congregation M.A's or pastor or office staff).</li>
        <li>Return tables, chairs and equipment to their original locations (especially when moved from other rooms).</li>
        <li>Keep the room clean and tidy. Take out food waste and trash after your meeting.</li>
        <li>Turn off lights, TV, AC/Heater and AV equipment before leaving the room.</li>
        <li>Make sure all windows and doors are closed and locked after your meeting.</li>
        <li>You may 'Cancel Event' from your <a href="https://rooms.sjcac.org/profile">user profile</a> to create availability for other groups.</li>
        <li>If you are the last person/group on campus, make sure you arm the alarm system. If not, please coordinate to make sure someone else can and lock up the church.</li>
        <li>
          Due to the increase of intruders/trespassers wandering onto the church campus, do not leave building entrance doors propped open or unattended.
          If you see or encounter someone suspicious, please be safe and alert <a href="mailto:celine.bower@sjcac.org">celine.bower@sjcac.org</a> or file an incident report here: 
          <a href="https://sjcac.churchcenter.com/people/forms/932890">Incident Report Form</a>
        </li>
        <li>
          Report any damage or broken items/equipment to the church office:
          <a href="https://sjcac.churchcenter.com/people/forms/947288">Maintenance Report Form</a>
        </li>
      </ol>

      <p>Thank you,</p>
      <p><strong>SJCAC Room Reservation Team</strong></p>
    `
  );
};

/**
 * Notify user their room reservation request has been canceled.
 */
const sendReservationCanceledEmail = async (userEmail, userName, eventName) => {
  await sendEmail(
    userEmail,
    'Your Room Reservation Request has been Canceled',
    'Your room reservation request has been canceled.',
    `
      <p>Dear ${userName},</p>
      <p>We regret to inform you that your room reservation request for <strong>${eventName}</strong> has been canceled.</p>
      <p>If you have any questions, please feel free to contact us.</p>
      <p>Thank you,</p>
      <p><strong>SJCAC Room Reservation Team</strong></p>
    `
  );
};

/**
 * Notify user their room reservation request has been edited (Fire-and-forget).
 */
const sendReservationEditedEmail = (userEmail, userName, eventName, eventDateTimeStart, eventDateTimeEnd, updatedRoomNames) => {

  const startTime = DateTime.fromISO(eventDateTimeStart, { zone: 'America/Los_Angeles' });
  const endTime = DateTime.fromISO(eventDateTimeEnd, { zone: 'America/Los_Angeles' });

  const eventDate = startTime.toLocaleString(DateTime.DATE_FULL); // e.g., "Monday, January 15, 2025"
  const eventTime = `${startTime.toLocaleString(DateTime.TIME_SIMPLE)} - ${endTime.toLocaleString(DateTime.TIME_SIMPLE)}`;

  // Return a Promise to handle the email asynchronously
  return new Promise((resolve, reject) => {
    sendEmail(
      userEmail,
      'Your Room Reservation Request has been Edited',
      'Your room reservation request has been updated.',
      `
        <p>Dear ${userName},</p>
        <p>Your room reservation request for <strong>${eventName}</strong> has been updated.</p>
        <p>Updated Details:</p>
        <ul>
          <li><strong>Date:</strong> ${eventDate}</li>
          <li><strong>Time:</strong> ${eventTime}</li>
          <li><strong>Room(s):</strong> ${updatedRoomNames.join(', ')}</li>
        </ul>
        <p>If you did not request this change, please contact us immediately.</p>
        <p>Thank you,</p>
        <p><strong>SJCAC Room Reservation Team</strong></p>
      `
    )
      .then(() => {
        console.log(`Email sent successfully to ${userEmail}`);
        resolve(); // Resolve the promise on success
      })
      .catch((error) => {
        console.error(`Failed to send email to ${userEmail}:`, error);
        reject(error); // Reject the promise on failure
      });
  });
};


/**
 * Notify admins about a new room reservation request.
 * @param {object} newEvent - The new room reservation request.
 * @returns {Promise<void>}
 */
const notifyAdminsOfNewRequest = async (newEvent) => {
  try {
    // Fetch the total number of pending events
    const numPendingEvents = await getNumPendingEvents();
    const admin_emails = ['matt.kwong@sjcac.org', 'audrey.kwong@sjcac.org']; // Replace with actual admin emails

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
      admin_emails.map((email) =>
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
  sendReservationReceivedEmail,
  sendReservationApprovedEmail,
  sendReservationCanceledEmail,
  sendReservationEditedEmail,
  notifyAdminsOfNewRequest,
};
