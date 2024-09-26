const passport = require('passport');
const GoogleStrategy = require('passport-google-oauth20').Strategy;
const session = require('express-session');
const RedisStore = require('connect-redis')(session);
const redisClient = require('redis').createClient();
const fs = require('fs');

/**
 * Initialize passport (google account login system)
 * @param {*} app 
 */
function initializePassport(app) {
    const credentials = JSON.parse(fs.readFileSync('./credentials.json', 'utf-8'));
    const { client_secret, client_id, callback_url } = credentials.passport;

    app.use(session({
        store: new RedisStore({ client: redisClient}),
        secret: 'SuperSecretSecret',
        resave: false,
        saveUninitialized: true,
        cookie: {
            secure: true, // This should be true if you're using HTTPS
            httpOnly: true, // Ensure cookie is only sent via HTTP(S), not client-side JavaScript
            sameSite: 'none', // This is important for cross-origin requests
            maxAge: 1000 * 60 * 60 * 24 // Set cookie expiration (optional, e.g., 24 hours)
        }
    }));
    app.use(passport.initialize());
    app.use(passport.session());

    passport.use(new GoogleStrategy({
        clientID: client_id,
        clientSecret: client_secret,
        callbackURL: callback_url,
    },
        (accessToken, refreshToken, profile, done) => {
            // Save user information to your database or process it as needed
            console.log("Logging in UserId: " + profile.id, profile);
            const user = {
                profile: profile,
                token: accessToken,
            }
            return done(null, user);
        }));

    passport.serializeUser((user, done) => {
        done(null, user);
    });

    passport.deserializeUser((obj, done) => {
        done(null, obj);
    });
}

module.exports = initializePassport;
