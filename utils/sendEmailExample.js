const sgMail = require('@sendgrid/mail')
require('dotenv').config()
sgMail.setApiKey(process.env.SENDGRID_API_KEY)

const msg = {
  to: 'mattkwong52@gmail.com', // Change to your recipient
  from: 'rooms@sjcac.org', // Change to your verified sender
  subject: 'Your Room Reservation Request has been Recieved',
  text: 'You will be notified upon further updates.',
  html: '<strong>and easy to do anywhere, even with Node.js</strong>',
}
sgMail
  .send(msg)
  .then(() => {
    console.log('Email sent')
  })
  .catch((error) => {
    console.error(error)
    console.log(process.env.SENDGRID_API_KEY);
  })