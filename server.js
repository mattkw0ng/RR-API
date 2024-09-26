const express = require('express');
const fs = require('fs');
const { google } = require('googleapis');
const bodyParser = require('body-parser');
const cors = require('cors');
const path = require('path');
const initializePassport = require('./passportConfig');
var session = require('express-session')

// Import routes
const authRoutes = require('./auth');
const eventRoutes = require('./events');
const roomsRoutes = require('./rooms');
const { CLIENT_URL } = require('./config');

// Initialize app & Passport
const app = express();
initializePassport(app);
const PORT = 5000;

app.use(bodyParser.json());
const corsOptions = {
  origin: CLIENT_URL, // Set to the origin of frontend
  credentials: true, // Allow credentials (cookies, authentication headers)
};

app.use(session({
  secret: 'your-secret',
  resave: false,  // Don't save session if unmodified
  saveUninitialized: false, // Don't create session until something is stored
  cookie: {
    secure: true, // This should be true if you're using HTTPS
    httpOnly: true, // Ensure cookie is only sent via HTTP(S), not client-side JavaScript
    sameSite: 'none', // This is important for cross-origin requests
    maxAge: 1000 * 60 * 60 * 24 // Set cookie expiration (optional, e.g., 24 hours)
  }
}));



app.use(cors(corsOptions));

const CREDENTIALS_PATH = path.join(__dirname, 'credentials.json');
const TOKEN_PATH = path.join(__dirname, 'token.json');
const SCOPES = ['https://www.googleapis.com/auth/calendar'];

// Session info logging
app.use((req, res, next) => {
  console.log('Session at the start of request:', req.session);
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
app.use('/api', roomsRoutes)




app.listen(PORT, () => {
  authorize();
  console.log(`\nServer running on http://3.20.203.208:${PORT}`);
});
