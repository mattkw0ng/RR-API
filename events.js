const express = require('express');
const { google } = require('googleapis');
const router = express.Router();
const fs = require('fs');
const path = require('path');
const roomsTools = require('./rooms');
const { unpackExtendedProperties } = require('./util');
const CREDENTIALS_PATH = path.join(__dirname, 'json/credentials.json');
const TOKEN_PATH = path.join(__dirname, 'json/token.json');
const PENDING_APPROVAL_CALENDAR_ID = "c_0430068aa84472bdb1aa16b35d4061cd867e4888a8ace5fa3d830bb67587dfad@group.calendar.google.com";
const APPROVED_CALENDAR_ID = 'c_8f9a221bd12882ccda21c5fb81effbad778854cc940c855b25086414babb1079@group.calendar.google.com';
const PROPOSED_CHANGES_CALENDAR_ID = 'c_8c14557969e2203d3eb811d73ac3add1abd73e45a9c337441b2b4aa95a141786@group.calendar.google.com';
const ROOM_IDS_PATH = path.join(__dirname, 'json/room-ids.json');
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

  return events.map((event) => unpackExtendedProperties(event))
}

// Usage example in your route
router.get('/userEvents', async (req, res) => {
  try {
    const userEmail = req.session.user.profile.emails[0].value; // Assuming you store the user's email in session
    console.log("++ /userEvents userEmail:", userEmail)
    // const events = await getUserEvents(userEmail);


    const auth = await authorize();
    const calendar = google.calendar({ version: 'v3', auth });

    const pendingEvents = await getUserEvents(calendar, PENDING_APPROVAL_CALENDAR_ID, userEmail);
    const approvedEvents = await getUserEvents(calendar, APPROVED_CALENDAR_ID, userEmail);
    const proposedEvents = await getUserEvents(calendar, PROPOSED_CHANGES_CALENDAR_ID, userEmail);
    console.log(proposedEvents);
    const result = (pendingEvents.length === 0 && approvedEvents.length === 0 && proposedEvents.length === 0)
      ? null :
      { 'pending': pendingEvents, 'approved': approvedEvents, 'proposed': proposedEvents };

    // console.log("++ /userEvents events:", events);
    res.status(200).json(result);
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

// Fetch Proposed Changes events
router.get('/proposedChangesEvents', async (req, res) => {
  try {
    const { isUser } = req.query; // if left out, default is false aka is Admin

    const auth = await authorize();
    const calendar = google.calendar({ version: 'v3', auth });

    const now = new Date();
    const nextWeek = new Date(now);
    nextWeek.setDate(nextWeek.getDate() + 7);

    const response = await calendar.events.list({
      calendarId: PROPOSED_CHANGES_CALENDAR_ID, // Replace with your "approved" calendar ID
      timeMin: now.toISOString(),
      timeMax: nextWeek.toISOString(),
      singleEvents: true,
      orderBy: 'startTime',
    });
    console.log(response.data.items);

    const events = response.data.items.filter((e) => e.extendedProperties.private.adminApproval === !isUser); // Filter by needsAdminApproval

    const parsedEvents = events.map((event) => unpackExtendedProperties(event));
    console.log("Parsed Proposed Events", parsedEvents);
    res.status(200).json(parsedEvents);
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
      singleEvents: false, // display recurring events as a single event
    });

    const parsedEvents = response.data.items.map((event) => unpackExtendedProperties(event));

    res.status(200).json(parsedEvents);
  } catch (error) {
    console.error('Error fetching pending events:', error.message);
    res.status(500).send('Error fetching pending events: ' + error.message);
  }
});

// Get [approved, pending] events for specific room and day
router.get('/getEventsByRoom', async (req, res) => {
  const auth = await authorize();
  const calendar = google.calendar({ version: 'v3', auth });
  const { roomId, time } = req.query;

  if (!roomId) {
    return res.status(400).json({ error: 'Room parameter is required' });
  }

  if (!time) {
    return res.status(400).json({ error: 'Time parameter is required' });
  }

  try {
    // Extract the start of the day and end of the day for the given time
    const targetDate = new Date(time);
    const timeMin = new Date(targetDate.setHours(0, 0, 0, 0)).toISOString(); // Start of the day
    const timeMax = new Date(targetDate.setHours(23, 59, 59, 999)).toISOString(); // End of the day

    // Query events from the specific room calendar within the time range
    const response = await calendar.events.list({
      calendarId: roomId,
      singleEvents: true,
      orderBy: 'startTime',
      timeMin: timeMin,
      timeMax: timeMax,
    });

    const pendingResponse = await calendar.events.list({
      calendarId: PENDING_APPROVAL_CALENDAR_ID,
      singleEvents: true,
      orderBy: 'startTime',
      timeMin: timeMin,
      timeMax: timeMax,
    });

    const approvedEvents = response.data.items || [];
    // filter pending events by room
    console.log(pendingResponse)
    const pendingEvents = pendingResponse.data.items.filter((e) => JSON.parse(e.extendedProperties.private.rooms).find((l) => l.email === roomId))
    res.status(200).json([approvedEvents, pendingEvents]);
  } catch (error) {
    console.error(`Error fetching events for room "${room}":`, error.message);
    res.status(500).json({ error: 'Failed to fetch events for the specified room and time.' });
  }
});


/**
 * Get All Events on a single day, and map them to the given list of available Rooms @see /getAvailableRooms 
 */
async function getEventsOnDay(auth, time, availableRooms) {
  const calendar = google.calendar({ version: "v3", auth });
  const targetDate = new Date(time);
  const timeMin = new Date(targetDate.setHours(0, 0, 0, 0)).toISOString(); // Start of the day
  const timeMax = new Date(targetDate.setHours(23, 59, 59, 999)).toISOString(); // End of the day

  const response = await calendar.events.list({
    calendarId: APPROVED_CALENDAR_ID,
    singleEvents: true,
    orderBy: 'startTime',
    timeMin: timeMin,
    timeMax: timeMax
  });

  const pendingResponse = await calendar.events.list({
    calendarId: PENDING_APPROVAL_CALENDAR_ID,
    singleEvents: true,
    orderBy: 'startTime',
    timeMin: timeMin,
    timeMax: timeMax
  });

  const allEvents = response.data.items;
  const pendingEvents = pendingResponse.data.items;
  const merged = Object.fromEntries(availableRooms.map((roomName) => {
    const targetId = ROOM_IDS[roomName];
    // Filter all events by mapping attendees list into list of emails and searching for targetId within this list
    return [roomName, {
      approvedEvents: allEvents.filter((element) => element.attendees.map((e) => e.email).includes(targetId)),
      pendingEvents: pendingEvents.filter((element) => element.attendees.map((e) => e.email).includes(targetId))
    }]
  }))

  return merged;
}

/**
 * Get Available Rooms and their Events @see /getAvailableRooms
 */
async function getAvailableRooms(auth, timeMin, timeMax, roomList) {
  const calendar = google.calendar({ version: "v3", auth });
  const requestBody = {
    timeMin: timeMin, // ISO 8601 format
    timeMax: timeMax, // ISO 8601 format
    timeZone: "America/Los_Angeles",
    items: Object.values(ROOM_IDS).map((id) => ({ id })),
  };

  const response = await calendar.freebusy.query({ requestBody });
  const busyRooms = response.data.calendars;

  // Determine available rooms
  const availableRooms = Object.keys(ROOM_IDS).filter((roomName) => {
    const calendarId = ROOM_IDS[roomName];
    // console.log(busyRooms[calendarId].busy);
    return !roomList.includes(roomName) & busyRooms[calendarId].busy.length === 0; // Room is available if no busy times
  });

  // console.log("Available Rooms:", availableRooms);
  return availableRooms;
}

async function mapToRoomDetails(availableRooms, allEvents) {
  console.log("Getting Room Details");
  for (room of availableRooms) {
    const res = await roomsTools.GetRoomDetails(room);
    allEvents[room].details = res;
  }
  return allEvents
}

/**
 * @description given a start and end time, and a list of rooms to exclude, provide a list of rooms that are available in this time window @see getAvailableRooms mapped to a list of events @see getEventsOnDay and basic room resource details
 * @type route
 */
router.get('/getAvailableRooms', async (req, res) => {
  const { timeMin, timeMax, excludeRooms } = req.query;
  console.log(req.query);
  const auth = await authorize();
  try {
    const availableRooms = await getAvailableRooms(auth, timeMin, timeMax, excludeRooms);
    const allEventsOnDay = await getEventsOnDay(auth, timeMin, availableRooms);
    const allEventsWithRoomDetails = await mapToRoomDetails(availableRooms, allEventsOnDay);
    // console.log(allEventsWithRoomDetails);
    res.status(200).json(allEventsWithRoomDetails);
  } catch (error) {
    console.error(`Error fetching available rooms for time: ${timeMin} - ${timeMax}:`, error.message);
    res.status(500).json({ error: 'Error fetching FreeBusy data' })
  }
})

async function getConflicts(room, start, end, id, calendar) {
  const conflictsResponse = await calendar.events.list({
    calendarId: room,
    singleEvents: true,
    timeMin: start,
    timeMax: end,
  })

  const conflicts = conflictsResponse.data.items.filter(
    (roomEvent) => roomEvent.id !== id
  );;
  return conflicts
}

// Get all conflicts from a list of rooms and a start and end time
async function getConflictsSimple(calendar, roomList, start, end) {
  const requestBody = {
    timeMin: start,
    timeMax: end,
    timeZone: 'America/Los_Angeles',
    items: roomList.map((id) => ({ id })),
  }

  const response = await calendar.freebusy.query({ requestBody });
  console.log(response.data.calendars);

  // filter the response by rooms that are busy (aka list of conflicts > 0) then map to an array of objects {roomId: String , times: Array}
  const filtered = Object.entries(response.data.calendars).filter((pair) => pair[1].busy.length > 0).map((pair) => ({ 'roomId': pair[0], 'times': pair[1].busy }));
  console.log(JSON.stringify(filtered));
  return filtered;
}

router.get('/checkConflicts', async (req, res) => {
  const { startDateTime, endDateTime, roomList } = req.query;
  console.log(req.query)

  if (!startDateTime || !endDateTime || !roomList) {
    res.status(400).send("Missing required fields");
  }

  try {
    const auth = await authorize();
    const calendar = google.calendar({ version: 'v3', auth })

    const conflicts = await getConflictsSimple(calendar, JSON.parse(roomList), startDateTime, endDateTime);

    res.status(200).json(conflicts);
  } catch (error) {
    console.error('Error checking conflicts for event: ', startDateTime, endDateTime, roomList, error);
    res.status(500).send('Error checking conflicts for event: ', startDateTime, endDateTime, roomList, error)
  }
})

// Get all events under Pending calendar with conflict detection and flagging (ADMIN PAGE)
router.get('/pendingEventsWithConflicts', async (req, res) => {
  try {
    const auth = await authorize();
    const calendar = google.calendar({ version: 'v3', auth });

    // Fetch pending events with room resources
    const response = await calendar.events.list({
      calendarId: PENDING_APPROVAL_CALENDAR_ID,
      singleEvents: false, // Ensure events are expanded to individual instances
      timeMin: new Date(),
    });
    const pendingEvents = response.data.items;

    const separatedEvents = {
      quickApprove: [],
      conflicts: []
    }
    // Check each room's availability independently
    for (const pendingEvent of pendingEvents) {
      const { start, end, extendedProperties } = pendingEvent
      console.log(pendingEvent);
      const roomResources = JSON.parse(extendedProperties.private.rooms).map((room) => room.email) // generate list of roomIds attatched to this event
      console.log(roomResources);
      // const roomResource = attendees?.find(attendee => attendee.resource === true);

      if (pendingEvent.recurrence) {
        // For recurring events, find all instances and check conflicts for each instance
        const instancesResponse = await calendar.events.instances({
          calendarId: PENDING_APPROVAL_CALENDAR_ID,
          eventId: pendingEvent.id,
        })
        const instances = instancesResponse.data.items;

        const instancesElaborated = [];
        let isConflict = false;
        for (const instance of instances) {
          // const conflicts = await roomResources.map((roomId) => getConflicts(roomId, instance.start.dateTime, instance.end.dateTime, instance.id, calendar)).flat();
          const conflicts = await getConflictsSimple(calendar, roomResources, instance.start.dateTime, instance.end.dateTime); // returns list [[calendarId, ]]
          isConflict = isConflict || conflicts.length > 0; //update isconflict to be true if there are conflicts
          instance.conflicts = conflicts;
          instancesElaborated.push(instance);
        }

        pendingEvent.instances = instancesElaborated;
        if (isConflict) {
          separatedEvents.conflicts.push(pendingEvent);
        } else {
          separatedEvents.quickApprove.push(pendingEvent);
        }

      } else {
        // Otherwise check conflicts for single event and add it to the event details 
        // const conflicts = await roomResources.map((roomId) => getConflicts(roomId, start.dateTime, end.dateTime, pendingEvent.id, calendar)).flat();
        const conflicts = await getConflictsSimple(calendar, roomResources, start.dateTime, end.dateTime);
        pendingEvent.conflicts = conflicts;
        // Place event into according list of separatedEvents
        if (conflicts.length > 0) {
          separatedEvents.conflicts.push(pendingEvent);
        } else {
          separatedEvents.quickApprove.push(pendingEvent);
        }

      }
    }

    res.status(200).json(separatedEvents);
  } catch (error) {
    console.error('Error fetching pending events:', error.message);
    res.status(500).send('Error fetching pending events: ' + error.message);
  }
});


/** Example POST request
 * await axios.post(API_URL + '/api/addEventWithRooms', {
        eventName,
        location,
        description,
        congregation,
        groupName,
        groupLeader,
        numPeople,
        startDateTime: start,
        endDateTime: end,
        rooms: selectedRooms, // Pass selected room to server
        userEmail: user.emails[0].value,
        rRule,

      });
 */

// MAIN ROOM REQUEST FUNCTION
router.post('/addEventWithRooms', async (req, res) => {
  console.log("Incoming event request");
  const { eventName, location, description, congregation, groupName, groupLeader, numPeople, startDateTime, endDateTime, rooms, userEmail, rRule } = req.body;

  if (!eventName || !startDateTime || !endDateTime || !rooms || rooms.length === 0) {
    return res.status(400).send('Missing required fields');
  }

  try {
    const summary = eventName
    const auth = await authorize();
    const calendar = google.calendar({ version: 'v3', auth });

    // Get the calendar IDs for the rooms (assuming you have a function to fetch them)
    const roomAttendees = await Promise.all(
      rooms.map(async (room) => {
        const roomId = await getCalendarIdByRoom(room);
        return { email: roomId, resource: true };
      })
    );
    console.log(roomAttendees)

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
        { email: userEmail } // Add the user as an attendee
      ],
      reminders: {
        useDefault: false,
        overrides: [
          { method: 'email', minutes: 24 * 60 },
          { method: 'popup', minutes: 10 },
        ],
      },
      extendedProperties: {
        private: {
          rooms: JSON.stringify(roomAttendees), // Store Room Information Here (not added officially to the room resource calendar until 'approved')
          groupName: groupName,
          groupLeader: groupLeader,
          congregation: congregation,
          numPeople: numPeople
        }
      }
    };
    console.log("Event Details", event);

    if (rRule != 'FREQ=') {
      event.recurrence = [`RRULE:${rRule}`]
    }

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

// Phased out : see moveAndUpdateEvent()
const approveEvent = async (eventId, calendar, fromCalendarId) => {
  // Retrieve the event details from the "Pending approval" calendar
  const eventResponse = await calendar.events.get({
    calendarId: fromCalendarId,
    eventId: eventId,
  });

  const event = eventResponse.data;

  if (fromCalendarId === PROPOSED_CHANGES_CALENDAR_ID) {
    delete event.id;
    delete event.etag;
  }
  // attatch room to event as an attendee
  event.attendees.push(...JSON.parse(event.extendedProperties.private.rooms))

  console.log("++ Approve Events event data:", event);

  // Insert the event into the "approved" calendar
  calendar.events.insert({
    calendarId: APPROVED_CALENDAR_ID,
    resource: event,
  });

  calendar.events.delete({
    calendarId: fromCalendarId,
    eventId: eventId,
  })
}

// New Approval Method
const moveAndUpdateEvent = async (eventId, calendar, sourceCalendarId, targetCalendarId, edits = {}) => {
  try {
    // Step 1: Move the event to the target calendar
    const movedEvent = await calendar.events.move({
      calendarId: sourceCalendarId,
      eventId,
      destination: targetCalendarId,
    });

    console.log(`Event moved: ${movedEvent.data.id}`);

    // Step 2: Prepare a clean update payload
    const updatedRequestBody = {
      summary: movedEvent.data.summary, // Keep the title
      description: movedEvent.data.description, // Keep the description
      start: movedEvent.data.start, // Preserve the start time
      end: movedEvent.data.end, // Preserve the end time
      extendedProperties: movedEvent.data.extendedProperties || {}, // Preserve extended properties
      ...edits, // Apply any additional edits
    };

    // If moving to the Approved calendar, handle attendees specifically
    if (targetCalendarId === APPROVED_CALENDAR_ID) {
      const roomAttendees = JSON.parse(movedEvent.data.extendedProperties?.private?.rooms || "[]");
      updatedRequestBody.attendees = [...(movedEvent.data.attendees || []), ...roomAttendees];
    }

    // Step 3: Update the event in the target calendar
    const updatedEvent = await calendar.events.update({
      calendarId: targetCalendarId,
      eventId: movedEvent.data.id,
      requestBody: updatedRequestBody,
    });

    console.log(`Event updated: ${updatedEvent.data.id}`);
    return updatedEvent.data;
  } catch (error) {
    console.error("Error moving or updating event:", error);
    throw error;
  }
};

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
    const data = await moveAndUpdateEvent(eventId, calendar, PENDING_APPROVAL_CALENDAR_ID, APPROVED_CALENDAR_ID);
    // console.log("Moved Event", data);

    res.status(200).json(data);
  } catch (error) {
    console.error('Error approving event:', error);
    res.status(500).send('Error approving event: ' + error.message);
  }
});

// Quickly Approve a list of events
router.post('/quickApprove', async (req, res) => {
  const { eventIdList } = req.body;

  if (!eventIdList || eventIdList.length === 0) {
    return res.status(400).send('Missing required fields')
  }

  try {
    const auth = await authorize();
    const calendar = google.calendar({ version: 'v3', auth });

    for (eventId of eventIdList) {
      await approveEvent(eventId, calendar, PENDING_APPROVAL_CALENDAR_ID);
    }

    res.status(200).send('Event List Approved');
  } catch (error) {
    console.error('Error approving list of events: ', error);
    res.status(500).send('Error approving list of events: ' + error.message);
  }
})

// Accept Proposed Changes (AKA previously approved events that have changed dates/times or rooms)
router.post('/acceptProposedChanges', async (req, res) => {
  const { eventId } = req.body;

  if (!eventId) {
    return res.status(400).send('Missing required fields (eventId)');
  }

  try {
    const auth = await authorize();
    const calendar = google.calendar({ version: 'v3', auth });

    await moveAndUpdateEvent(eventId, calendar, PROPOSED_CHANGES_CALENDAR_ID, APPROVED_CALENDAR_ID);

    res.status(200).send('Proposed Changes have been Accepted')
  } catch (error) {
    console.error('Error accepting proposed changes', error);
    res.status(500).send('Error accepting proposed changes' + error);
  }
})

// Function to move an event to the Proposed Changes calendar (from Approved calendar)
const moveToProposedChangesCalendar = async (auth, event, needAdminApproval = true) => {
  const calendar = google.calendar({ version: "v3", auth });

  // Create a new event in the Proposed Changes calendar
  const proposedEvent = {
    ...event,
    attendees: event.attendees || [],
    extendedProperties: {
      ...event.extendedProperties,
      private: {
        ...event.extendedProperties?.private,
        originalCalendarID: event.organizer.email, // Track the original calendar ID
        originalEventID: event.id, // Track the original event ID
        adminApproval: needAdminApproval, // Mark this event as needing approval by Admin (AKA TRUE: this event should show up on the Admin Page || FALSE: User Profile Page )
      },
    },
  };

  // Remove unnecessary fields
  const editedEvent = await moveAndUpdateEvent(event.id, calendar, needAdminApproval ? APPROVED_CALENDAR_ID : PENDING_APPROVAL_CALENDAR_ID, PROPOSED_CHANGES_CALENDAR_ID, proposedEvent)

  return editedEvent;
};

// Edit an Event (Either updates the event or moves to proposedChanges calendar for another round of approval)
router.post('/editEvent', async (req, res) => {
  const { event, timeOrRoomChanged, adminEdit } = req.body;
  const needAdminApproval = !adminEdit; // if admin submitted these edits, the approval process should go back to the user
  if (!event || typeof timeOrRoomChanged === 'undefined') {
    console.log("Bad Request", req.body);
    return res.status(400).json({ error: "Invalid request. Event data and 'timeOrRoomChanged' flag are required." });
  }

  try {
    const auth = await authorize();
    const calendar = google.calendar({ version: "v3", auth });

    if (timeOrRoomChanged) {
      // Move to Proposed Changes calendar
      const newEvent = await moveToProposedChangesCalendar(auth, event, needAdminApproval);
      return res.status(200).json({
        message: "Event moved to Proposed Changes calendar for approval.",
        newEvent,
      });
    } else {
      // Directly update the event in its current calendar
      const updatedEvent = await calendar.events.update({
        calendarId: event.organizer.email,
        eventId: event.id,
        requestBody: event,
      });

      return res.status(200).json({
        message: "Event updated successfully.",
        updatedEvent: updatedEvent.data,
      });
    }
  } catch (error) {
    console.error("Error updating event:", error);
    return res.status(500).json({ error: "Failed to update event." });
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
  console.log("Req body:", req.body);
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

// Reject a pending Event (delete?)
router.delete('rejectEvent', async (req, res) => {
  try {
    const { eventId } = req.body;
    const auth = await authorize();
    const calendar = google.calendar({ version: 'v3', auth });

    await calendar.events.delete({
      calendarId: PENDING_APPROVAL_CALENDAR_ID, // Pending Calendar ID
      eventId: eventId, // Event ID
    });

    res.status(200).json({ message: 'Event successfully deleted' });
  } catch (error) {
    console.error('Error deleting event:', error.message);

    // Step 5: Handle errors
    if (error.code === 404) {
      res.status(404).json({ error: 'Event not found' });
    } else {
      res.status(500).json({ error: 'Failed to delete event' });
    }
  }
})


module.exports = router;