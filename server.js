const express = require('express');
const fs = require('fs');
const { google } = require('googleapis');
const bodyParser = require('body-parser');
const cors = require('cors');
const path = require('path');
const initializePassport = require('./config/passportConfig');
const session = require('express-session');
const RedisStore = require('connect-redis').default;
const { createClient } = require('redis');
const cookieParser = require('cookie-parser')
const { authorize } = require("./utils/authorize");
const { watchCalendar, syncAllCalendarsOnStartup } = require("./utils/webhook-utils");

// Import routes
const authRoutes = require('./auth');
const eventRoutes = require('./events');
const roomsRoutes = require('./rooms');
const emailRoutes = require('./routes/email');
const webhookRoutes = require('./routes/webhook')
const { CLIENT_URL } = require('./config/config');

// Load credentials from JSON
const credentialsPath = path.join(__dirname, "./json/credentials.json");
const credentials = JSON.parse(fs.readFileSync(credentialsPath, "utf-8"));
const { client_id, client_secret, refresh_token } = credentials.web;

// Set environment variables
process.env.CLIENT_ID = client_id;
process.env.CLIENT_SECRET = client_secret;
process.env.REFRESH_TOKEN = refresh_token;
process.env.EMAIL = 'rooms@sjcac.org';
const PENDING_APPROVAL_CALENDAR_ID = process.env.PENDING_APPROVAL_CALENDAR_ID;
const APPROVED_CALENDAR_ID = process.env.APPROVED_CALENDAR_ID;
const PROPOSED_CHANGES_CALENDAR_ID = process.env.PROPOSED_CHANGES_CALENDAR_ID;

// CORS config
const corsOptions = {
  origin: CLIENT_URL, // Set to the origin of frontend
  credentials: true, // Allow credentials (cookies, authentication headers)
};

// Initialize Redis
const redisClient = createClient({
  url: 'redis://localhost:6379' // Replace with your Redis URL if it's different
});
redisClient.connect().catch(console.error);

// Initialize APP w/ CORS & Passport
const app = express();
app.set("trust proxy", 1);
app.use(cors(corsOptions));
app.use(cookieParser());
app.use(session({
  store: new RedisStore({ client: redisClient }),
  secret: 'SuperSecretSecret3',
  resave: false,
  saveUninitialized: false,
  cookie: {
    sameSite: 'lax', // This is important for cross-origin requests
    domain: '.sjcac.org',
    secure: true, // This should be true if you're using HTTPS
    httpOnly: true, // Ensure cookie is only sent via HTTP(S), not client-side JavaScript
    maxAge: 1000 * 60 * 60 * 24, // Set cookie expiration (optional, e.g., 24 hours)
  }
}));

initializePassport(app);
const PORT = 5000;

app.use(bodyParser.json());

// const CREDENTIALS_PATH = path.join(__dirname, 'json/credentials.json');
// const TOKEN_PATH = path.join(__dirname, 'token.json');
// const SCOPES = [
//   "https://www.googleapis.com/auth/gmail.send", // For sending emails
//   'https://www.googleapis.com/auth/calendar' // For calendar access
// ];

// Session info logging
app.use((req, res, next) => {
  console.log('===== NEW INCOMING REQUEST =====')
  // Log the session ID
  console.log('Session ID + userId:', req.sessionID, req.user?.id);

  // Log the request method (GET, POST, etc.)
  console.log('Request Method:', req.method);

  // Log the request URL
  console.log('Request URL:', req.originalUrl);

  // Log the cookies sent with the request
  // console.log('Cookies:', req.cookies);

  // Log the session data, if any
  // console.log('Session Data:', req.session);

  // Log any request body data (only if it's a POST/PUT request with body)
  // if (req.method === 'POST' || req.method === 'PUT') {
  //   console.log('Request Body:', req.body);
  // }

  next();
});

app.use('/api/', authRoutes);
app.use('/api/', eventRoutes);
app.use('/api/', roomsRoutes.router);
app.use('/api/email', emailRoutes);
app.use('/', webhookRoutes);

app.get('/test', async (req, res) => {
  res.send("Hello World!!");
})

app.use((req, res) => {
  console.warn(`Blocked request to undefined path: ${req.method} ${req.originalUrl}`);
  res.status(403).send('Forbidden: This path is not allowed.');
});

// Setup Google Calendar Webhook for updating events
(async () => {
  try {
    await syncAllCalendarsOnStartup();

    console.log("Setting up Webhooks")
    const calendars = [APPROVED_CALENDAR_ID, PENDING_APPROVAL_CALENDAR_ID, PROPOSED_CHANGES_CALENDAR_ID];
    
    for (const calendarId of calendars) {
      await watchCalendar(calendarId);
    }
    
    console.log("Google Calendar Webhook is active");
  } catch (error) {
    console.error("Failed to start Google Calendar Webhook:", error);
  }
})();

app.listen(PORT, () => {
  authorize();
  console.log(`\nServer running on http://3.20.203.208:${PORT}`);
});
