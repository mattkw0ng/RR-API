const express = require('express');
const { google } = require('googleapis');
const router = express.Router();
const fs = require('fs');
const path = require('path');

const CREDENTIALS_PATH = path.join(__dirname, 'credentials.json');
const TOKEN_PATH = path.join(__dirname, 'token.json');
const PENDING_APPROVAL_CALENDAR_ID = "c_0430068aa84472bdb1aa16b35d4061cd867e4888a8ace5fa3d830bb67587dfad@group.calendar.google.com";
const APPROVED_CALENDAR_ID = 'c_8f9a221bd12882ccda21c5fb81effbad778854cc940c855b25086414babb1079@group.calendar.google.com';
const ROOM_IDS_PATH = path.join(__dirname, 'room-ids.json');
const ROOM_IDS = JSON.parse(fs.readFileSync(ROOM_IDS_PATH, 'utf-8'));

async function getCalendarIdByRoom(room) {
  // const query = 'SELECT calendar_id FROM rooms WHERE name = $1';
  // const result = await pool.query(query, [room]);
  // if (result.rows.length > 0) {
  //   return result.rows[0].calendar_id;
  // }
  // throw new Error(`Room not found: ${room}`);
  return ROOM_IDS[room]
}

// Get list of events
async function listEvents(calendarId, auth, startTime, endTime) {
  const calendar = google.calendar({ version: 'v3', auth });

  try {
    const response = await calendar.events.list({
      calendarId: calendarId,
      timeMin: startTime.toISOString(),
      timeMax: endTime.toISOString(),
      singleEvents: true,
      orderBy: 'startTime',
    });
    return response.data.items;
  } catch (err) {
    console.error('Error fetching events:', err);
    return [];
  }
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

async function getUserEvents(userEmail, maxResults = 5) {
  try {
    const auth = await authorize();
    const calendar = google.calendar({ version: 'v3', auth });

    const now = new Date();

    const response = await calendar.events.list({
      calendarId: 'primary', // or your specific calendar ID
      timeMin: now.toISOString(),
      singleEvents: true,
      orderBy: 'startTime',
      maxResults, // Limit to 5 events
      q: userEmail, // Search by user email in attendees
    });

    // Filter the events by matching the user's email in the attendees
    const events = response.data.items.filter(event =>
      event.attendees && event.attendees.some(attendee => attendee.email === userEmail)
    );
    console.log("++++++ Events", events);
    return events;
  } catch (error) {
    console.error('Error fetching user events:', error.message);
    throw new Error('Error fetching user events: ' + error.message);
  }
};

// Usage example in your route
router.get('/userEvents', async (req, res) => {
  try {
    const userEmail = req.session.user.profile.emails[0].value; // Assuming you store the user's email in session
    console.log("++ /userEvents userEmail:", userEmail)
    // const events = await getUserEvents(userEmail);


    const auth = await authorize();
    const calendar = google.calendar({ version: 'v3', auth });

    const now = new Date();

    const response = await calendar.events.list({
      calendarId: PENDING_APPROVAL_CALENDAR_ID, // or your specific calendar ID
      timeMin: now.toISOString(),
      singleEvents: true,
      orderBy: 'startTime',
      q: userEmail, // Search by user email in attendees
    });

    console.log('++ /userEvents response', response)
    // Filter the events by matching the user's email in the attendees
    const events = response.data.items.filter(event =>
      event.attendees && event.attendees.some(attendee => attendee.email === userEmail)
    );

    console.log("++ /userEvents events:", events);
    res.status(200).json(events);
  } catch (error) {
    res.status(500).send(error.message);
  }
});

// Return the 5 upcoming events within the next week
router.get('/upcomingEvents', async (req, res) => {
  const auth = await authorize();
  const startTime = new Date();
  startTime.setHours(0, 0, 0, 0); // Start of the current day
  const endTime = new Date(startTime.getTime() + 7 * 24 * 60 * 60 * 1000); // 7 days from now

  try {
    const chapelEvents = await listEvents(ROOM_IDS['Chapel'], auth, startTime, endTime);
    const sanctuaryEvents = await listEvents(ROOM_IDS['Sanctuary'], auth, startTime, endTime);

    const upcomingEvents = [...chapelEvents, ...sanctuaryEvents].slice(0, 5); // Combine and limit to 10 events
    res.json(upcomingEvents);
  } catch (error) {
    console.error('Error fetching upcoming events:', error);
    res.status(500).send('Error fetching events');
  }
});

// Fetch aprroved events
router.get('/approvedEvents', async (req, res) => {
  try {
    const auth = await authorize();
    const calendar = google.calendar({ version: 'v3', auth });

    const now = new Date();
    const nextWeek = new Date(now);
    nextWeek.setDate(nextWeek.getDate() + 7);

    const response = await calendar.events.list({
      calendarId: APPROVED_CALENDAR_ID, // Replace with your "approved" calendar ID
      timeMin: now.toISOString(),
      timeMax: nextWeek.toISOString(),
      singleEvents: true,
      orderBy: 'startTime',
    });

    res.status(200).json(response.data.items);
  } catch (error) {
    console.error('Error fetching approved events:', error.message);
    res.status(500).send('Error fetching approved events: ' + error.message);
  }
});


// Get all the events under the "Pending Events Calendar"
router.get('/pendingEvents', async (req, res) => {
  try {
    const auth = await authorize();
    const calendar = google.calendar({ version: 'v3', auth });

    const now = new Date();
    const nextWeek = new Date(now);
    nextWeek.setDate(nextWeek.getDate() + 7);

    const response = await calendar.events.list({
      calendarId: PENDING_APPROVAL_CALENDAR_ID, // Replace with your "Pending approval" calendar ID
      timeMin: now.toISOString(),
      timeMax: nextWeek.toISOString(),
      singleEvents: true,
      orderBy: 'startTime',
    });

    res.status(200).json(response.data.items);
  } catch (error) {
    console.error('Error fetching pending events:', error.message);
    res.status(500).send('Error fetching pending events: ' + error.message);
  }
});

// Add and event to the "Pending approval" Calendar, with the room added as an "attendee" resource
router.post('/addEventWithRoom', async (req, res) => {
  console.log("Incoming event request");
  const { summary, location, description, startDateTime, endDateTime, room, userEmail } = req.body;

  if (!summary || !startDateTime || !endDateTime || !room) {
    return res.status(400).send('Missing required fields');
  }

  try {
    const roomId = await getCalendarIdByRoom(room);
    const auth = await authorize();
    const calendar = google.calendar({ version: 'v3', auth });

    const event = {
      summary,
      location,
      description,
      start: {
        dateTime: startDateTime,
        timeZone: 'America/Los_Angeles',
      },
      end: {
        dateTime: endDateTime,
        timeZone: 'America/Los_Angeles',
      },
      // This is where the event is also added to the respective Rooms/Resource Calendar (google categorizes this as an attendee)
      // The calendarID is placed under the email tag, and resource is set to TRUE
      attendees: [
        { email: roomId, resource: true },
        { email: userEmail }
      ],
      reminders: {
        useDefault: false,
        overrides: [
          { method: 'email', minutes: 24 * 60 },
          { method: 'popup', minutes: 10 },
        ],
      },
    };

    const response = await calendar.events.insert({
      calendarId: PENDING_APPROVAL_CALENDAR_ID,
      resource: event,
    });

    console.log('Event created: %s', response.data.htmlLink);
    res.status(200).send('Event added');
  } catch (error) {
    console.error('Error adding event:', error);
    res.status(500).send('Error adding event: ' + error.message);
  }
});

// Move event from the "Pending approval" Calendar to the "approved" Calendar
router.post('/approveEvent', async (req, res) => {
  const { eventId } = req.body;

  if (!eventId) {
    return res.status(400).send('Missing required fields');
  }

  try {
    const auth = await authorize();
    const calendar = google.calendar({ version: 'v3', auth });

    // Retrieve the event details from the "Pending approval" calendar
    const eventResponse = await calendar.events.get({
      calendarId: PENDING_APPROVAL_CALENDAR_ID,
      eventId: eventId,
    });

    const event = eventResponse.data;

    // Insert the event into the "approved" calendar
    await calendar.events.insert({
      calendarId: APPROVED_CALENDAR_ID,
      resource: event,
    });

    // Delete the event from the "Pending approval" calendar
    await calendar.events.delete({
      calendarId: PENDING_APPROVAL_CALENDAR_ID,
      eventId: eventId,
    });

    res.status(200).send('Event approved');
  } catch (error) {
    console.error('Error approving event:', error);
    res.status(500).send('Error approving event: ' + error.message);
  }
});



// Check what rooms are available at any given time/date
router.get('/checkAvailability', async (req, res) => {
  const { startDateTime, endDateTime } = req.query;

  if (!startDateTime || !endDateTime) {
    return res.status(400).send('Missing startDateTime or endDateTime');
  }

  const auth = await authorize();
  const startTime = new Date(startDateTime);
  const endTime = new Date(endDateTime);

  try {
    const chapelEvents = await listEvents(ROOM_IDS['Chapel'], auth, startTime, endTime);
    const sanctuaryEvents = await listEvents(ROOM_IDS['Sanctuary'], auth, startTime, endTime);

    const reservedRooms = [];
    if (chapelEvents.length > 0) reservedRooms.push('Chapel');
    if (sanctuaryEvents.length > 0) reservedRooms.push('Sanctuary');

    const availableRooms = reservedRooms.length === 0 ? ['Chapel', 'Sanctuary'] : ['Chapel', 'Sanctuary'].filter(room => !reservedRooms.includes(room));

    res.json(availableRooms);
  } catch (error) {
    console.error('Error checking availability:', error);
    res.status(500).send('Error checking availability');
  }
});


router.post('/addUserEvent', async (req, res) => {
  if (!req.user) {
      return res.status(401).send('User not authenticated');
  }

  const { summary, location, description, startDateTime, endDateTime } = req.body;

  if (!summary || !startDateTime || !endDateTime) {
      return res.status(400).send('Missing required fields');
  }

  try {
      const oauth2Client = new google.auth.OAuth2();
      oauth2Client.setCredentials(req.user.token);

      const calendar = google.calendar({ version: 'v3', auth: oauth2Client });

      const event = {
          summary,
          location,
          description,
          start: {
              dateTime: startDateTime,
              timeZone: 'America/Los_Angeles',
          },
          end: {
              dateTime: endDateTime,
              timeZone: 'America/Los_Angeles',
          },
          reminders: {
              useDefault: false,
              overrides: [
                  { method: 'email', minutes: 24 * 60 },
                  { method: 'popup', minutes: 10 },
              ],
          },
      };

      calendar.events.insert({
          calendarId: 'primary',
          resource: event,
      }, (err, event) => {
          if (err) {
              console.error('There was an error contacting the Calendar service:', err.message);
              return res.status(500).send('Error adding event: ' + err.message);
          }
          console.log('Event created: %s', event.data.htmlLink);
          res.status(200).send('Event added to your calendar');
      });
  } catch (error) {
      console.error('Error adding event:', error);
      res.status(500).send('Error adding event');
  }
});

router.get('/eventsByAttendee', async (req, res) => {
  const auth = await authorize();
  const calendar = google.calendar({ version: 'v3', auth });

  const attendeeEmail = req.query.email; // Get the email from query parameters

  if (!attendeeEmail) {
    return res.status(400).send('Email is required');
  }

  calendar.events.list({
    calendarId: 'primary', // or the specific calendar ID you want to search
    q: attendeeEmail, // search query
    timeMin: (new Date()).toISOString(), // Only get future events
    singleEvents: true,
    orderBy: 'startTime',
  }, (err, response) => {
    if (err) {
      console.error('The API returned an error: ' + err);
      return res.status(500).send('Error retrieving events');
    }
    const events = response.data.items;
    if (events.length) {
      res.json(events);
    } else {
      res.status(404).send('No events found for this attendee');
    }
  });
});


module.exports = router;