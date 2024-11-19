const passport = require('passport');
const GoogleStrategy = require('passport-google-oauth20').Strategy;
const fs = require('fs');

/**
 * Initialize passport (google account login system)
 * @param {*} app 
 */
function initializePassport(app) {
    const credentials = JSON.parse(fs.readFileSync('./json/credentials.json', 'utf-8'));
    const { client_secret, client_id, callback_url } = credentials.passport;
    
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
