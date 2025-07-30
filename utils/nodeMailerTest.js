const nodemailer = require('nodemailer');
require('dotenv').config()

const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: 'rooms@sjcac.org',
    pass: process.env.NODEMAILER_PASS
  }
});

const sendEmail = async (to, subject, html) => {
  await transporter.sendMail({
    from: '"SJCAC Room Reservations" <rooms@sjcac.org>',
    to,
    subject,
    html,
  });
};

sendEmail('matt.kwong@sjcac.org', 'Test Email from SJCAC Room Reservations', '<p>This is a test email sent using <strong>nodemailer</strong>.</p>')
  .then(() => {
    console.log('Email sent successfully');
  })
  .catch((error) => {
    console.error('Error sending email:', error);
  });