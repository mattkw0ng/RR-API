// auth.js
const express = require('express');
const passport = require('passport');
const router = express.Router();
const pool = require('./db');
const { google } = require('googleapis');
const { CLIENT_URL } = require('./config/config');
const { upsertUser, getUserByEmail, updateUserRole } = require('./utils/users');
const { isAuthenticated, isAdmin } = require('./middlewares/auth');

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
router.get('/auth/google', (req, res, next) => {
  const { returnPath } = req.query; // e.g., ?returnPath=/reservation-form
  if (returnPath) {
    req.session.returnPath = returnPath;
  }

  next();
},
  passport.authenticate('google', { scope: ['profile', 'email'] }));

router.get('/auth/google/callback', passport.authenticate('google', { failureRedirect: CLIENT_URL + '/login' }), // Redirect to React router's login page on failure
  async (req, res) => {
    try {
      console.log('=======get /auth/google/callback======= session before\n', req.sessionID, req.session)
      const profile = req.user.profile;

      // Extract user details from the Google profile
      const user = {
        email: profile.emails[0].value,
        name: profile.displayName,
        googleId: profile.id,
      };

      // Upsert the user into the database
      await upsertUser(user);

      req.session.token = req.user.token; // probably unncessary
      req.session.user = req.user;
      const returnPath = req.session.returnPath || "/";
      delete req.session.returnPath;

      console.log('=======get /auth/google/callback======= session after\n', req.sessionID, req.session, returnPath);

      req.session.save((err) => {
        if (err) {
          console.error('Error saving session', err);
        } else {
          console.log("Session successfully saved to Redis", req.session);
        }
      })
      res.redirect(CLIENT_URL + returnPath); // Redirect to React router's home page on success
    } catch (err) {
      console.error('Error handling Google callback', err);
      res.status(500).send('Error handling Google callback: ' + err.message)
    }

  });

router.get('/logout', (req, res) => {
  req.logout((err) => {
    if (err) {
      return next(err);
    }
    res.redirect(CLIENT_URL + '/login'); // Redirect to React router's login page on logout
  });
});

router.get('/test', (req, res) => {
  console.log(req.header);
  res.send("Hello world")
})

router.get('/set-cookie', (req, res) => {
  // Manually setting a cookie with specific options
  res.cookie('testCookie', 'testValue', {
    httpOnly: true, // Only accessible by the web server
    secure: true,   // Ensure the browser only sends the cookie over HTTPS
    sameSite: 'none', // Allow cross-site requests
    maxAge: 1000 * 60 * 60 * 24, // 24 hours
  });
  res.on('finish', () => {
    console.log(`XX= Request to ${req.method} ${req.url} - Response headers:`, res.getHeaders());
  });
  res.send('Cookie has been set');
});

router.get('/get-cookie', (req, res) => {
  // Checking if the cookie was set
  const cookie = req.cookies;
  console.log(req.cookies)
  res.send(`Cookie received: ${cookie}`);
});

router.get('/auth/user', async (req, res) => {
  console.log('=======get /auth/user=======\n', req.session);
  if (req.isAuthenticated()) {
    console.log("Authenticated")
    // console.log({ user: req.user.profile })
    const dbUser = await getUserByEmail(req.user.profile.emails[0].value);
    if (!dbUser) {
      return res.status(404).json({error: 'User not found in database'});
    }
    
    req.session.role = dbUser.role; // Add role to session

    res.json({ user: {
      ...req.user.profile,
      role: dbUser.role
    } }); // Send user info to frontend if authenticated
  } else {
    console.log("Not Authenticated")
    res.status(401).json({ error: 'Not authenticated' }); // Send error if not authenticated
  }
});

router.get('/auth/getUserByEmail', async (req, res) => {
  const { userEmail } = req.query;
  if (userEmail) {
    const userData = await getUserByEmail(userEmail);
    console.log("Fetched User Data: ", userData);
    res.json(userData);
  } else {
    res.status(500).send('No email provided');
  }
})

router.post('/admin', isAuthenticated, isAdmin, async (req, res) => {
  const { email } = req.body;
  if (!email) {
    return res.status(400).json({error: "Email is required"});
  }

  try {
    const user = await getUserByEmail(email);
    if (!user) {
      return res.status(404).json({error: "User not found"});
    }

    await updateUserRole(email, 'admin');
    res.status(200).json({message: `User ${email} has been promoted to admin`});
  } catch (error) {
    console.error("Error promoting user to admin", error);
    res.status(500).json({error: 'Server Error'})
  }
})

// Dummy Login function for testing session storage
router.post('/auth/login', (req, res) => {

  req.session.user = { id: 1, username: 'testUser', email: "mattkwong52@gmail.com" };

  req.session.save((err) => {
    if (err) {
      console.error('Session save error', err);
    }
    console.log("Session data: ", req.sessionID, req.session);
    res.on('finish', () => {
      console.log(`XX= Request to ${req.method} ${req.url} - Response headers:`, res.getHeaders());
    });
    res.send({ message: "Logged in" });
  })
})


router.get('/', (req, res) => {
  res.send(req.isAuthenticated() ? `Hello, ${req.user.displayName}` : 'Not logged in');
});

router.get('/oauth2callback', (req, res) => {
  const code = req.query.code;
  console.log(code);
});

module.exports = router;
