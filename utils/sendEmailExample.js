// Test sendEmail.js
const { sendEmail, sendReservationReceivedEmail } = require('./sendEmail.js');

const testSendEmail = async () => {
  try {
    console.log('Testing sendEmail...');
    await sendEmail(
      'matt.kwong@sjcac.org', // Replace with a valid recipient email
      'Testing new sendEmail function',
      'This is a plain text test email.',
      '<p>This is a <strong>HTML</strong> test email.</p>'
    );
    console.log('sendEmail test passed!');
  } catch (error) {
    console.error('sendEmail test failed:', error);
  }
};

const testSendReservationReceivedEmail = async () => {
  try {
    console.log('Testing sendReservationReceivedEmail...');
    await sendReservationReceivedEmail(
      'matt.kwong@sjcac.org', // Replace with a valid recipient email
      'John Doe', // User's name
      '[IGNORE] Test Event', // Event name
      '2025-01-15T10:00:00-08:00', // Event start time (ISO format)
      '2025-01-15T12:00:00-08:00', // Event end time (ISO format)
      ['Room A', 'Room B'], // Room names
      'https://example.com/event-link' // Event link
    );
    console.log('sendReservationReceivedEmail test passed!');
  } catch (error) {
    console.error('sendReservationReceivedEmail test failed:', error);
  }
};

// Run the test functions
(async () => {
  await testSendEmail();
  await testSendReservationReceivedEmail();
})();
