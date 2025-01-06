const AWS = require('aws-sdk');
require('dotenv').config();

const SES_CONFIG = {
  accessKeyId: process.env.AWS_ACCESS_KEY,
  secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  region: process.env.AWS_SES_REGION
}

const AWS_SES = new AWS.SES(SES_CONFIG);

const sendEmail = async (recipientEmail, name) => {
  let params = {
    Source: process.env.AWS_SES_SENDER,
    Destination: {
      ToAddresses: [
        recipientEmail
      ],
    },
    ReplyToAddresses: [],
    Message: {
      Body: {
        Html: {
          Charset: 'UTF-8',
          Data: '<h1>This is the header of my email!</h1>'
        },
        Text: {
          Charset: 'UTF-8',
          Data: 'This is the body of the email',
        }
      },
      Subject: {
        Charset: 'UTF-8',
        Data: `Hello, ${name}!`
      }
    },
  };

  try {
    const res = await AWS_SES.sendEmail(params).promise();
    console.log('Email has been sent!', res);
  } catch (error) {
    console.error(error);
  }
}

sendEmail("rooms@sjcac.org", "Matthew");