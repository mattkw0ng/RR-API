const nodemailer = require("nodemailer");
const { authorize } = require("./authorize"); // Import the Google OAuth2 authorization function

// Function to create a Nodemailer transporter
const createTransporter = async () => {
  const oAuth2Client = await authorize();
  const accessToken = await oAuth2Client.getAccessToken();

  return nodemailer.createTransport({
    service: "gmail",
    auth: {
      type: "OAuth2",
      user: process.env.EMAIL, // Your email address (e.g., rooms@sjcac.org)
      clientId: process.env.CLIENT_ID,
      clientSecret: process.env.CLIENT_SECRET,
      refreshToken: process.env.REFRESH_TOKEN,
      accessToken: accessToken.token,
    },
  });
};

// Function to send an email
const sendEmail = async (to, subject, text, html) => {
  try {
    const transporter = await createTransporter();

    const mailOptions = {
      from: process.env.EMAIL, // Sender address
      to, // Recipient address
      subject, // Subject line
      text, // Plain text body
      html, // HTML body (optional)
    };

    const info = await transporter.sendMail(mailOptions);
    console.log("Email sent:", info.response);
    return info;
  } catch (error) {
    console.error("Error sending email:", error);
    throw error;
  }
};

module.exports = { sendEmail };