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
const { authorize } = require("./util");

// Import routes
const authRoutes = require('./auth');
const eventRoutes = require('./events');
const roomsRoutes = require('./rooms');
const { CLIENT_URL } = require('./config/config');

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
      sameSite: 'none', // This is important for cross-origin requests
      secure: true, // This should be true if you're using HTTPS
      httpOnly: true, // Ensure cookie is only sent via HTTP(S), not client-side JavaScript
      maxAge: 1000 * 60 * 60 * 24, // Set cookie expiration (optional, e.g., 24 hours)
  }
}));

initializePassport(app);
const PORT = 5000;

app.use(bodyParser.json());

const CREDENTIALS_PATH = path.join(__dirname, 'json/credentials.json');
const TOKEN_PATH = path.join(__dirname, 'token.json');
const SCOPES = [
  "https://www.googleapis.com/auth/gmail.send", // For sending emails
  'https://www.googleapis.com/auth/calendar' // For calendar access
];

// Session info logging
app.use((req, res, next) => {
  console.log('===== NEW INCOMING REQUEST =====')
  // Log the session ID
  console.log('Session ID:', req.sessionID);

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
app.use('/api/', roomsRoutes.router)

app.get('/test', async (req, res) => {
  res.send("Hello World!!");
})

app.use((req, res) => {
  console.warn(`Blocked request to undefined path: ${req.method} ${req.originalUrl}`);
  res.status(403).send('Forbidden: This path is not allowed.');
});

app.listen(PORT, () => {
  authorize();
  console.log(`\nServer running on http://3.20.203.208:${PORT}`);
});
