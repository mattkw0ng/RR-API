const sgMail = require('@sendgrid/mail');

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
const sendReservationReceivedEmail = async (userEmail, userName, eventName, eventDate, eventTime, roomNames) => {
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
      <p>You will be notified upon further updates regarding your reservation.</p>
      <p>Thank you,</p>
      <p><strong>SJCAC Room Reservation Team</strong></p>
    `
  );
};

/**
 * Notify user their room reservation request has been approved.
 */
const sendReservationApprovedEmail = async (userEmail, userName, eventName, eventDate, eventTime, roomNames) => {
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
 * Notify user their room reservation request has been edited.
 */
const sendReservationEditedEmail = async (userEmail, userName, eventName, updatedEventDate, updatedEventTime, updatedRoomNames) => {
  await sendEmail(
    userEmail,
    'Your Room Reservation Request has been Edited',
    'Your room reservation request has been updated.',
    `
      <p>Dear ${userName},</p>
      <p>Your room reservation request for <strong>${eventName}</strong> has been updated.</p>
      <p>Updated Details:</p>
      <ul>
        <li><strong>Date:</strong> ${updatedEventDate}</li>
        <li><strong>Time:</strong> ${updatedEventTime}</li>
        <li><strong>Room(s):</strong> ${updatedRoomNames.join(', ')}</li>
      </ul>
      <p>If you did not request this change, please contact us immediately.</p>
      <p>Thank you,</p>
      <p><strong>SJCAC Room Reservation Team</strong></p>
    `
  );
};

module.exports = {
  sendReservationReceivedEmail,
  sendReservationApprovedEmail,
  sendReservationCanceledEmail,
  sendReservationEditedEmail,
};
