// auth.js
const express = require('express');
const passport = require('passport');
const router = express.Router();
const pool = require('./db');
const { google } = require('googleapis');
const { CLIENT_URL } = require('./config');

async function authorizeUser(email) {
  const result = await pool.query('SELECT access_token, refresh_token, token_expiry FROM users WHERE email = $1', [email]);
  
  if (result.rows.length > 0) {
      const { access_token, refresh_token, token_expiry } = result.rows[0];
      const oAuth2Client = new google.auth.OAuth2(client_id, client_secret, redirect_uri);
      
      oAuth2Client.setCredentials({
          access_token,
          refresh_token,
          expiry_date: token_expiry,
      });
      
      // Check if the access token is expired
      if (Date.now() > token_expiry) {
          try {
              const newTokens = await oAuth2Client.refreshAccessToken();
              const { access_token, expiry_date } = newTokens.credentials;

              // Update the tokens in the database
              await pool.query(
                  `UPDATE users SET access_token = $1, token_expiry = $2 WHERE email = $3`,
                  [access_token, expiry_date, email]
              );
          } catch (error) {
              console.error('Error refreshing access token:', error);
          }
      }

      return oAuth2Client;
  } else {
      // No tokens found, user needs to authenticate
      return null;
  }
}



// Google OAuth routes
router.get('/auth/google',
  passport.authenticate('google', { scope: ['profile', 'email'] }));

router.get('/auth/google/callback', passport.authenticate('google', { failureRedirect: CLIENT_URL + '/login' }), // Redirect to React router's login page on failure
  (req, res) => {

    req.session.token = req.user.token;
    console.log('=======get /auth/google/callback=======\n', req.user);
    console.log('=======get /auth/google/callback=======\n', req.session.token);
    res.redirect(CLIENT_URL + '/'); // Redirect to React router's home page on success
  });

// router.post('/auth/google/callback', async (req, res) => {
//   const { code } = req.query;
//   const oAuth2Client = new google.auth.OAuth2(client_id, client_secret, redirect_uri);
  
//   const { tokens } = await oAuth2Client.getToken(code);
//   oAuth2Client.setCredentials(tokens);
  
//   const { access_token, refresh_token, expiry_date } = tokens;

//   // Save tokens to the database
//   const userEmail = 'user@example.com'; // Replace with the authenticated user's email
//   await pool.query(
//       `INSERT INTO users (email, access_token, refresh_token, token_expiry)
//        VALUES ($1, $2, $3, $4)
//        ON CONFLICT (email)
//        DO UPDATE SET access_token = $2, refresh_token = $3, token_expiry = $4`,
//       [userEmail, access_token, refresh_token, expiry_date]
//   );
  
//   res.redirect('/profile'); // Redirect to your app's home page after successful login
// });

router.get('/logout', (req, res) => {
  req.logout((err) => {
    if (err) {
      return next(err);
    }
    res.redirect(CLIENT_URL + '/login'); // Redirect to React router's login page on logout
  });
});

router.get('/auth/user', (req, res) => {
  console.log('=======get /auth/user=======\n', req.session.token);
  if (req.isAuthenticated()) {
    console.log("Authenticated")
    res.json({ user: req.user.profile }); // Send user info to frontend if authenticated
  } else {
    res.status(401).json({ error: 'Not authenticated' }); // Send error if not authenticated
  }
});


router.get('/', (req, res) => {
  res.send(req.isAuthenticated() ? `Hello, ${req.user.displayName}` : 'Not logged in');
});

router.get('/oauth2callback', (req, res) => {
  const code = req.query.code;
  console.log(code);
});

module.exports = router;
