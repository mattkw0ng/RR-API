const express = require('express');
const fs = require('fs');
const { google } = require('googleapis');
const bodyParser = require('body-parser');
const cors = require('cors');
const path = require('path');
const initializePassport = require('./passportConfig');
const session = require('express-session');
const RedisStore = require('connect-redis').default;
const { createClient } = require('redis');
const cookieParser = require('cookie-parser')

// Import routes
const authRoutes = require('./auth');
const eventRoutes = require('./events');
const roomsRoutes = require('./rooms');
const { CLIENT_URL } = require('./config');

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

const CREDENTIALS_PATH = path.join(__dirname, 'credentials.json');
const TOKEN_PATH = path.join(__dirname, 'token.json');
const SCOPES = ['https://www.googleapis.com/auth/calendar'];

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

// Get Access Token from Google
async function getAccessToken(oAuth2Client) {
  const authUrl = oAuth2Client.generateAuthUrl({
    access_type: 'offline',
    scope: SCOPES,
  });
  console.log('Authorize this router by visiting this url:', authUrl);
  const rl = require('readline').createInterface({
    input: process.stdin,
    output: process.stdout,
  });
  rl.question('Enter the code from that page here: ', (code) => {
    rl.close();
    oAuth2Client.getToken(code, (err, token) => {
      if (err) return console.error('Error retrieving access token', err);
      oAuth2Client.setCredentials(token);
      fs.writeFileSync(TOKEN_PATH, JSON.stringify(token));
      console.log('Token stored to', TOKEN_PATH);
    });
  });
}

// Authorize {rooms@sjcac.org} account
async function authorize() {
  const credentials = JSON.parse(fs.readFileSync(CREDENTIALS_PATH, 'utf-8'));
  const { client_secret, client_id, redirect_uris } = credentials.web;
  const oAuth2Client = new google.auth.OAuth2(client_id, client_secret, redirect_uris[0]);

  if (fs.existsSync(TOKEN_PATH)) {
    const token = fs.readFileSync(TOKEN_PATH, 'utf-8');
    oAuth2Client.setCredentials(JSON.parse(token));
  } else {
    await getAccessToken(oAuth2Client);
  }
  return oAuth2Client;
}

app.use('/', authRoutes);
app.use('/api', eventRoutes);
app.use('/api', roomsRoutes.router)

app.listen(PORT, () => {
  authorize();
  console.log(`\nServer running on http://3.20.203.208:${PORT}`);
});
