const fs = require("fs");
const readline = require("readline");
const { google } = require("googleapis");

const SCOPES = [
  "https://www.googleapis.com/auth/gmail.send",
  "https://www.googleapis.com/auth/calendar",
];
const CREDENTIALS_PATH = "./json/credentials.json";
const TOKEN_PATH = "./json/token.json";

// Get Access Token from Google
async function getAccessToken(oAuth2Client) {
  const authUrl = oAuth2Client.generateAuthUrl({
    access_type: "offline",
    scope: SCOPES,
  });
  console.log("Authorize this app by visiting this url:", authUrl);

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  return new Promise((resolve, reject) => {
    rl.question("Enter the code from that page here: ", (code) => {
      rl.close();
      oAuth2Client.getToken(code, (err, token) => {
        if (err) {
          console.error("Error retrieving access token", err);
          return reject(err);
        }
        oAuth2Client.setCredentials(token);
        fs.writeFileSync(TOKEN_PATH, JSON.stringify(token));
        console.log("Token stored to", TOKEN_PATH);
        resolve(oAuth2Client);
      });
    });
  });
}

// Authorize Google API
async function authorize() {
  const credentials = JSON.parse(fs.readFileSync(CREDENTIALS_PATH, "utf-8"));
  const { client_secret, client_id, redirect_uris } = credentials.web;
  const oAuth2Client = new google.auth.OAuth2(client_id, client_secret, redirect_uris[0]);

  if (fs.existsSync(TOKEN_PATH)) {
    const token = JSON.parse(fs.readFileSync(TOKEN_PATH, "utf-8"));
    oAuth2Client.setCredentials(token);
  } else {
    await getAccessToken(oAuth2Client);
  }

  return oAuth2Client;
}


function unpackExtendedProperties(event) {
  if (!event.extendedProperties || !event.extendedProperties.private) {
    return event; // Return the event unchanged if no extendedProperties are found
  }

  const privateProps = { ...event.extendedProperties.private };

  // Conditionally parse the 'rooms' key
  if (privateProps.rooms && typeof privateProps.rooms === "string") {
    try {
      privateProps.rooms = JSON.parse(privateProps.rooms);
    } catch (error) {
      console.error("Error parsing 'rooms':", error);
    }
  }

  // Conditionally parse the 'originalRooms' key
  if (privateProps.originalRooms && typeof privateProps.originalRooms === "string") {
    try {
      privateProps.originalRooms = JSON.parse(privateProps.originalRooms);
    } catch (error) {
      console.error("Error parsing 'originalRooms':", error);
    }
  }

  // Return the updated event with unpacked extendedProperties
  return {
    ...event,
    extendedProperties: {
      ...event.extendedProperties,
      private: privateProps,
    },
  };
}

module.exports = {unpackExtendedProperties, authorize, getAccessToken };