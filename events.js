const express = require('express');
const { google } = require('googleapis');
const router = express.Router();
const fs = require('fs');
const path = require('path');
const roomsTools = require('./rooms')
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

// GET room names from event location: 'San Jose Christian Alliance Church, A-1-Sanctuary (325), A-1-A102 : Youth Wing (15), B-2-Chapel (150)'
function extractRooms(input) {
  // Step 1: Split by commas and remove the first part (church name)
  const parts = input.split(',').slice(1).map(item => item.trim());

  // Step 2: Use REGEX to extract the room name part and compare
  const regex = /[A-Z]-\d+-(.*) \(\d+\)/;
  const bookedRooms = parts.map(part => {
    const match = part.match(regex);
    return match ? match[1] : null; // match[1] captures the room name
  }).filter(Boolean); // Remove null entries

  // Step 3: Clean up room names by removing anything after a colon
  const cleanedBookedRooms = bookedRooms.map(room => room.split(' :')[0].trim());

  console.log(cleanedBookedRooms);

  // Step 4: Find rooms that are NOT in the bookedRooms
  // const availableRooms = Object.keys(ROOM_IDS).filter(room => !cleanedBookedRooms.includes(room));

  return cleanedBookedRooms;
};

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

// Check Availability of rooms given a certain time frame
// Returns list of available rooms
const checkAvailability = async (startDateTime, endDateTime) => {
  if (!startDateTime || !endDateTime) {
    throw new Error('Missing startDateTime or endDateTime');
  }
  // console.log('Times:', startDateTime, endDateTime, new Date(startDateTime).toISOString());

  const auth = await authorize();
  const startTime = new Date(startDateTime);
  const endTime = new Date(endDateTime);

  console.log('Times converted', startTime.toLocaleTimeString(), endTime.toLocaleTimeString())

  // Get approved and pending event conflicts
  const approvedConflicts = await listEvents(APPROVED_CALENDAR_ID, auth, startTime, endTime);
  const pendingConflicts = await listEvents(PENDING_APPROVAL_CALENDAR_ID, auth, startTime, endTime);

  // Collect locations from conflicts
  const locations = approvedConflicts.map(conflict => conflict.location);

  // Extract booked rooms from locations
  const bookedLocations = locations.flatMap(location => extractRooms(location));

  // Remove duplicates and flatten the list
  const combinedList = [...new Set(bookedLocations.flat())];

  // Get available rooms by filtering out booked rooms
  const availableRooms = Object.keys(ROOM_IDS).filter(room => !combinedList.includes(room));
  
  return availableRooms;
};

async function getUserEvents(calendar, calendarId, userEmail) {
  const now = new Date();

  const response = await calendar.events.list({
    calendarId: calendarId, // or your specific calendar ID
    timeMin: now.toISOString(),
    singleEvents: true,
    orderBy: 'startTime',
    q: userEmail, // Search by user email in attendees
  });

  // console.log('++ /userEvents response', response)
  // Filter the events by matching the user's email in the attendees
  const events = response.data.items.filter(event =>
    event.attendees && event.attendees.some(attendee => attendee.email === userEmail)
  );

  return events
}

// Usage example in your route
router.get('/userEvents', async (req, res) => {
  try {
    const userEmail = req.session.user.profile.emails[0].value; // Assuming you store the user's email in session
    console.log("++ /userEvents userEmail:", userEmail)
    // const events = await getUserEvents(userEmail);


    const auth = await authorize();
    const calendar = google.calendar({ version: 'v3', auth });

    const pendingEvents = getUserEvents(calendar, PENDING_APPROVAL_CALENDAR_ID, userEmail);
    const approvedEvents = getUserEvents(calendar, APPROVED_CALENDAR_ID, userEmail);

    // console.log("++ /userEvents events:", events);
    res.status(200).json({'pending': pendingEvents, 'approved': approvedEvents});
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
      singleEvents: true,
      orderBy: 'startTime',
    });

    res.status(200).json(response.data.items);
  } catch (error) {
    console.error('Error fetching pending events:', error.message);
    res.status(500).send('Error fetching pending events: ' + error.message);
  }
});

// MAIN ROOM REQUEST FUNCTION
router.post('/addEventWithRooms', async (req, res) => {
  console.log("Incoming event request");
  const { summary, location, description, startDateTime, endDateTime, rooms, userEmail } = req.body;

  if (!summary || !startDateTime || !endDateTime || !rooms || rooms.length === 0) {
    return res.status(400).send('Missing required fields');
  }

  try {
    const auth = await authorize();
    const calendar = google.calendar({ version: 'v3', auth });

    // Get the calendar IDs for the rooms (assuming you have a function to fetch them)
    const roomAttendees = await Promise.all(
      rooms.map(async (room) => {
        const roomId = await getCalendarIdByRoom(room);
        return { email: roomId, resource: true };
      })
    );

    // Create the event object
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
      attendees: [
        ...roomAttendees, // Add all the room resources
        { email: userEmail } // Add the user as an attendee
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

    // // Retrieve the event details from the "Pending approval" calendar
    // const eventResponse = await calendar.events.get({
    //   calendarId: PENDING_APPROVAL_CALENDAR_ID,
    //   eventId: eventId,
    // });

    // const event = eventResponse.data;

    // console.log("++ Approve Events event data:", event);

    // // Insert the event into the "approved" calendar
    // await calendar.events.insert({
    //   calendarId: APPROVED_CALENDAR_ID,
    //   resource: event,
    // });

    await calendar.events.move({
      calendarId: PENDING_APPROVAL_CALENDAR_ID,
      eventId: eventId,
      destination: APPROVED_CALENDAR_ID,
    }).then((response) => {
      console.log(response);
    })

    
    res.status(200).send('Event approved');
  } catch (error) {
    console.error('Error approving event:', error);
    res.status(500).send('Error approving event: ' + error.message);
  }
});




// Check what rooms are available at any given time/date
router.get('/checkAvailability', async (req, res) => {
  const { startDateTime, endDateTime } = req.query;

  try {
    const availableRooms = await checkAvailability(startDateTime, endDateTime);
    res.json(availableRooms);
  } catch (error) {
    console.error('Error checking availability:', error.message);
    res.status(400).send(error.message);
  }
});

// Filter rooms based off of time, capacity, and resources
router.post('/filterRooms', async (req, res) => {
  console.log( "Req body:", req.body );
  const { startDateTime, endDateTime, capacity, resources } = req.body;

  try {
    const availableRooms = await checkAvailability(startDateTime, endDateTime);
    const matchingRooms = await roomsTools.SearchRoom(capacity, resources);
    console.log("CheckAvailability", availableRooms);
    
    const matchingRoomsNames = matchingRooms.map((elem) => {
      return elem.room_name;
    })
    console.log("roomsTools.SearchRoom => Names", matchingRoomsNames);
    const merged = availableRooms.filter((room) => {
      return matchingRoomsNames.includes(room);
    })
    console.log("Res:", merged);
    res.json(merged);
  } catch (error) {
    console.error('Error filtering rooms:', error.message);
    res.status(400).send(error.message);
  }

})


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