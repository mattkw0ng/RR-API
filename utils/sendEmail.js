const nodemailer = require('nodemailer');
const { getNumPendingEvents } = require('./event-utils');
const { DateTime } = require('luxon');
const { parseRRule } = require('../util');
require('dotenv').config();
const log = require('./log');

// Configure Nodemailer transporter
const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: 'rooms@sjcac.org', // Your verified sender email
    pass: process.env.NODEMAILER_PASS, // Password or App Password from Gmail
  },
});

/**
 * Reusable function to send an email using Nodemailer
 * @param {string} toEmail - The recipient's email address
 * @param {string} subject - The subject of the email
 * @param {string} text - Plain text version of the email content
 * @param {string} html - HTML version of the email content
 * @returns {Promise<void>}
 */
const sendEmail = async (toEmail, subject, text, html) => {
  const mailOptions = {
    from: '"SJCAC Room Reservations" <rooms@sjcac.org>', // Sender's email
    to: toEmail, // Recipient's email
    subject, // Email subject
    text, // Plain text content
    html, // HTML content
    cc: 'rooms@sjcac.org', // CC to admin
  };

  try {
    await transporter.sendMail(mailOptions);
    log.info(`Email sent to ${toEmail}`);
  } catch (error) {
    log.error('Error sending email:', error);
    throw new Error('Email delivery failed');
  }
};

// Email templates

/**
 * Notify user their room reservation request has been received.
 */
const sendReservationReceivedEmail = async (userEmail, userName, eventName, eventDateTimeStart, eventDateTimeEnd, roomNames, htmlLink, recurring=false, rRule) => {
  const startTime = DateTime.fromISO(eventDateTimeStart, { zone: 'America/Los_Angeles' });
  const endTime = DateTime.fromISO(eventDateTimeEnd, { zone: 'America/Los_Angeles' });

  const eventDate = startTime.toLocaleString(DateTime.DATE_FULL); // e.g., "Monday, January 15, 2025"
  const eventTime = `${startTime.toLocaleString(DateTime.TIME_SIMPLE)} - ${endTime.toLocaleString(DateTime.TIME_SIMPLE)}`;

  await sendEmail(
    userEmail,
    `Your Room Reservation Request has been recieved ${recurring ? '(Recurring Event)' : ''}`,
    'Your room reservation request has been received. You will be notified upon further updates.',
    `
      <p>Dear ${userName},</p>
      <p>We have received your room reservation request for <strong><a href="${htmlLink}" target="_blank">${eventName}</a></strong>.</p>
      <p>Details:</p>
      <ul>
        <li><strong>Date:</strong> ${eventDate}</li>
        <li><strong>Time:</strong> ${eventTime}</li>
        <li><strong>Room(s):</strong> ${roomNames.join(', ')}</li>
      </ul>
      ${recurring ? `<p>${parseRRule(rRule)}</p>` : ''}
      ${recurring ? `<p><strong>Note:</strong> This is a recurring event. You will be notified if any instances cannot be approved due to conflicts.</p>` : ''}

      <p>You will be notified via email when your reservation is approved. You can check real time status <a href='https://rooms.sjcac.org/profile'>here on the profile page</a>.</p>
      <small>Note: You may recieve an email titled 'Invitation from an unknown sender:'. Do not be alarmed, this is an automated message from Google notifying you that you have been added as an attendee to this calendar event. Either disregard this email or click accept to add a copy of this event any future events to your personal calendar.</small>
      <p>Thank you,</p>
      <p><strong>SJCAC Room Reservation Team</strong></p>
    `
  );
};

/**
 * Notify user their room reservation request has been approved.
 */
const sendReservationApprovedEmail = async (userEmail, userName, eventName, eventDateTimeStart, eventDateTimeEnd, roomNames, message="", htmlLink, recurring=false) => {
  const startTime = DateTime.fromISO(eventDateTimeStart, { zone: 'America/Los_Angeles' });
  const endTime = DateTime.fromISO(eventDateTimeEnd, { zone: 'America/Los_Angeles' });

  const eventDate = startTime.toLocaleString(DateTime.DATE_FULL); // e.g., "Monday, January 15, 2025"
  const eventTime = `${startTime.toLocaleString(DateTime.TIME_SIMPLE)} - ${endTime.toLocaleString(DateTime.TIME_SIMPLE)}`;

  await sendEmail(
    userEmail,
    `Your Room Reservation Request has been approved ${recurring ? '(Recurring Event)' : ''}`,
    'Your room reservation request has been approved.',
    `
      <p>Dear ${userName},</p>
      <p>Your room reservation request for <strong><a href="${htmlLink}" target="_blank">${eventName}</a></strong> has been approved.</p>
      <p>Details:</p>
      <ul>
        <li><strong>Date:</strong> ${eventDate}</li>
        <li><strong>Time:</strong> ${eventTime}</li>
        <li><strong>Room(s):</strong> ${roomNames.join(', ')}</li>
      </ul>
      ${recurring ? `<p>${parseRRule(recurring)}</p>` : ''}
      ${recurring ? `<p><strong>Note:</strong> This is a recurring event. If any instances cannot be approved due to conflicts, you will be notified separately.</p>` : ''}

      ${message ? `<p><strong>Message from the admin:</strong> ${message}</p>` : ''}

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
 * Notify user their recurring room reservation request has been partially approved due to conflicts.
 * @param {string} userEmail
 * @param {string} userName
 * @param {string} eventName
 * @param {string} eventDateTimeStart
 * @param {string} eventDateTimeEnd
 * @param {string[]} roomNames
 * @param {Array<Object>} conflictingInstances - Array of conflicting event instances (with start/end)
 * @param {string} message
 * @param {string} htmlLink
 */
const sendReservationPartiallyApprovedEmail = async (
  userEmail,
  userName,
  eventName,
  eventDateTimeStart,
  eventDateTimeEnd,
  roomNames,
  conflictingInstances = [],
  message = "",
  htmlLink
) => {
  const startTime = DateTime.fromISO(eventDateTimeStart, { zone: 'America/Los_Angeles' });
  const endTime = DateTime.fromISO(eventDateTimeEnd, { zone: 'America/Los_Angeles' });

  const eventDate = startTime.toLocaleString(DateTime.DATE_FULL);
  const eventTime = `${startTime.toLocaleString(DateTime.TIME_SIMPLE)} - ${endTime.toLocaleString(DateTime.TIME_SIMPLE)}`;

  // Format conflicting instances as a list
  let conflictsHtml = '';
  if (conflictingInstances.length > 0) {
    conflictsHtml = `<ul>` + conflictingInstances.map(inst => {
      const s = DateTime.fromISO(inst.start.dateTime || inst.start.date, { zone: 'America/Los_Angeles' });
      const e = DateTime.fromISO(inst.end.dateTime || inst.end.date, { zone: 'America/Los_Angeles' });
      return `<li><strong>Date:</strong> ${s.toLocaleString(DateTime.DATE_FULL)}, <strong>Time:</strong> ${s.toLocaleString(DateTime.TIME_SIMPLE)} - ${e.toLocaleString(DateTime.TIME_SIMPLE)}</li>`;
    }).join('') + `</ul>`;
  }

  await sendEmail(
    userEmail,
    'Your Room Reservation Request has been Partially Approved (Recurring Event)',
    'Your recurring room reservation request has been partially approved. Some instances could not be approved due to conflicts.',
    `
      <p>Dear ${userName},</p>
      <p>Your recurring room reservation request for <strong><a href="${htmlLink}" target="_blank">${eventName}</a></strong> has been <strong>partially approved</strong>.</p>
      <p>Details of the approved reservation:</p>
      <ul>
        <li><strong>Date:</strong> ${eventDate}</li>
        <li><strong>Time:</strong> ${eventTime}</li>
        <li><strong>Room(s):</strong> ${roomNames.join(', ')}</li>
      </ul>

      <p><strong>Note:</strong> Some instances of your recurring event could not be approved due to conflicts with other reservations. These conflicting dates remain in the pending calendar and are still viewable on your <a href='https://rooms.sjcac.org/profile'>profile page</a>. If you have any questions, please contact <a href="mailto:rooms@sjcac.org">rooms@sjcac.org</a>.</p>

      ${conflictsHtml ? `<h4>Conflicting Dates:</h4>${conflictsHtml}` : ''}

      ${message ? `<p><strong>Message from the admin:</strong> ${message}</p>` : ''}

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
const sendReservationEditedEmail = (userEmail, userName, eventName, eventDateTimeStart, eventDateTimeEnd, updatedRoomNames, htmlLink) => {

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
        <p>Your room reservation request for <strong><a href="${htmlLink}" target="_blank">${eventName}</a></strong> has been updated.</p>
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
        log.info(`Email sent successfully to ${userEmail}`);
        resolve(); // Resolve the promise on success
      })
      .catch((error) => {
        log.error(`Failed to send email to ${userEmail}:`, error);
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

    log.info('Notification email sent to admins.');
  } catch (error) {
    log.error('Error notifying admins:', error.message);
    throw new Error('Failed to notify admins');
  }
};

module.exports = {
  sendEmail,
  sendReservationReceivedEmail,
  sendReservationApprovedEmail,
  sendReservationCanceledEmail,
  sendReservationEditedEmail,
  notifyAdminsOfNewRequest,
  sendReservationPartiallyApprovedEmail,
};
