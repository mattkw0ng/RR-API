const nodemailer = require("nodemailer");
const authorize = require("./authorize");

async function createTransporter() {
  const oAuth2Client = await authorize();
  const accessToken = await getAccessToken();

  return nodemailer.createTransport({
    service: "gmail",
    auth: {
      type: "OAuth2",
      user: "rooms@sjcac.org", // Gmail address you're sending from
      clientId: oAuth2Client._clientId,
      clientSecret: oAuth2Client._clientSecret,
      refreshToken: oAuth2Client.credentials.refresh_token,
      accessToken: accessToken.token,
    },
  });
}
