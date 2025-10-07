const fs = require("fs");
const readline = require("readline");
const { google } = require("googleapis");
const log = require("./utils/log");

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
  log.info("Authorize this app by visiting this url:", authUrl);

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  return new Promise((resolve, reject) => {
    rl.question("Enter the code from that page here: ", (code) => {
      rl.close();
      oAuth2Client.getToken(code, (err, token) => {
        if (err) {
          log.error("Error retrieving access token", err);
          return reject(err);
        }
        oAuth2Client.setCredentials(token);
        fs.writeFileSync(TOKEN_PATH, JSON.stringify(token));
        log.info("Token stored to", TOKEN_PATH);
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
  log.info("Unpacking extended properties for event ID:", event.id);
  if (!event.extendedProperties || !event.extendedProperties.private) {
    return event; // Return the event unchanged if no extendedProperties are found
  }

  const privateProps = { ...event.extendedProperties.private };

  // Conditionally parse the 'rooms' key
  if (privateProps.rooms && typeof privateProps.rooms === "string") {
    try {
      privateProps.rooms = JSON.parse(privateProps.rooms);
    } catch (error) {
      log.error("Error parsing 'rooms':", error);
    }
  }

  // Conditionally parse the 'originalRooms' key
  if (privateProps.originalRooms && typeof privateProps.originalRooms === "string") {
    try {
      privateProps.originalRooms = JSON.parse(privateProps.originalRooms);
    } catch (error) {
      log.error("Error parsing 'originalRooms':", error);
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

function parseRRule(rRule) {
  if (!rRule) return "No recurrence set.";
  log.info("Parsing rRule: ", rRule)
  // Split the rRule into key-value pairs
  const ruleParts = rRule
    .replace("RRULE:", "")
    .split(";")
    .reduce((acc, part) => {
      const [key, value] = part.split("=");
      acc[key] = value;
      return acc;
    }, {});

  // Map frequency to a readable format
  const frequencyMap = {
    DAILY: "day",
    WEEKLY: "week",
    MONTHLY: "month",
    YEARLY: "year",
  };

  const daysMap = {
    MO: "Monday",
    TU: "Tuesday",
    WE: "Wednesday",
    TH: "Thursday",
    FR: "Friday",
    SA: "Saturday",
    SU: "Sunday",
  };

  const freq = frequencyMap[ruleParts.FREQ] || "custom recurrence";
  const interval = ruleParts.INTERVAL ? `every ${ruleParts.INTERVAL} ${freq}${ruleParts.INTERVAL > 1 ? 's' : ''}` : `every ${freq}`;
  const count = ruleParts.COUNT ? ` ${ruleParts.COUNT} time${ruleParts.COUNT > 1 ? 's' : ''}` : "";
  log.info("ParseRRule ruleparts.until: ", ruleParts.UNTIL);

  const rruleDateString = ruleParts.UNTIL;
  const formattedDate = rruleDateString ? new Date(
    `${rruleDateString.slice(0, 4)}-${rruleDateString.slice(4, 6)}-${rruleDateString.slice(6, 8)}T${rruleDateString.slice(9, 11)}:${rruleDateString.slice(11, 13)}:${rruleDateString.slice(13, 15)}Z`
  ) : null;

  const until = ruleParts.UNTIL
    ? ` until ${formattedDate.toLocaleString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}`
    : "";

  // Parse BYDAY if present
  const byDay = ruleParts.BYDAY
    ? ` on ${ruleParts.BYDAY.split(",").map((day) => daysMap[day]).join(", ")}`
    : "";

  // Combine the sentence
  return `"Repeats ${interval}${byDay}${count}${until}."`;
};

module.exports = {unpackExtendedProperties, authorize, getAccessToken, parseRRule };