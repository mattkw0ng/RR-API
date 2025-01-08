const { SESClient, SendTemplatedEmailCommand } = require("@aws-sdk/client-ses");
require('dotenv').config();

const SES_CONFIG = {
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  },
  region: process.env.AWS_SES_REGION,
};

const sesClient = new SESClient(SES_CONFIG);

const sendMail = async (templateName, recipientEmail) => {
  const sendTemplatedEmailCommand = new SendTemplatedEmailCommand({
    Destination: {
      ToAddresses: [
        recipientEmail,
      ]
    },
    Source: process.env.AWS_SES_SENDER,
    Template: templateName,
    TemplateData: JSON.stringify({name: 'Matthew Kwong'}),
  });

  try {
    const res = await sesClient.send(sendTemplatedEmailCommand);
    console.log("Email with Template sent!", res);
  } catch (error) {
    console.error(error);
  }
}

sendMail('SES-Template-Example', "rooms@sjcac.org")