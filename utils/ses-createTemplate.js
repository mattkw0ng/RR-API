const { SESClient, CreateTemplateCommand } = require("@aws-sdk/client-ses");
require('dotenv').config();

const SES_CONFIG = {
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  },
  region: process.env.AWS_SES_REGION,
};

const sesClient = new SESClient(SES_CONFIG);

const run = async(template_name) => {
  const createTemplateCommand = new CreateTemplateCommand({
    Template: {
      TemplateName: template_name,
      HtmlPart: `
        <h1> Hello, {{name}}</h1>
        <p>
        Your Reservation has been submitted: 
        </p>
      `,
      TextPart: `Hello, {{name}} This is the text part`,
      SubjectPart: `Room Reservation`
    },
  });

  try {
    const res = await sesClient.send(createTemplateCommand);
    console.log('SES template has been created', res);
  } catch (error) {
    console.error(error)
  }
}

run('SES-Template-Example');
