const express = require('express');
const { google } = require('googleapis');
const { RRule } = require('rrule');
const { DateTime } = require('luxon');
const router = express.Router();
const fs = require('fs');
const path = require('path');
const roomsTools = require('./rooms');
require('dotenv').config()
const PENDING_APPROVAL_CALENDAR_ID = process.env.PENDING_APPROVAL_CALENDAR_ID;
const APPROVED_CALENDAR_ID = process.env.APPROVED_CALENDAR_ID;
const PROPOSED_CHANGES_CALENDAR_ID = process.env.PROPOSED_CHANGES_CALENDAR_ID;
const ROOM_IDS_PATH = path.join(__dirname, 'json/room-ids.json');
const ROOM_IDS = JSON.parse(fs.readFileSync(ROOM_IDS_PATH, 'utf-8'));
const { authorize } = require("./utils/authorize");
const { unpackExtendedProperties } = require('./utils/general');
const { extractEventDetailsForEmail, checkForConflicts, getAvailability, getRoomNamesFromCalendarIds, generateRoomsAttendeesList, detectRoomsFormat } = require('./utils/event-utils');
const {
  sendReservationReceivedEmail,
  sendReservationApprovedEmail,
  sendReservationCanceledEmail,
  sendReservationEditedEmail,
  notifyAdminsOfNewRequest,
} = require('./utils/sendEmail');

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

async function getUserEvents(calendar, calendarId, userEmail, history) {
  const now = new Date();

  const queryOptions = {
    calendarId: calendarId, // or your specific calendar ID
    singleEvents: false,
    q: userEmail, // Search by user email in attendees
  };

  if (history) {
    // Get all past events
    queryOptions.timeMax = now.toISOString();
  } else {
    // Get all future events
    queryOptions.timeMin = now.toISOString()
  }

  try {
    const response = await calendar.events.list(queryOptions);
    // Filter the events by matching the user's email in the attendees
    const events = response.data.items.filter(event =>
      event.attendees && event.attendees.some(attendee => attendee.email === userEmail && event.extendedProperties?.private?.adminApproval !== "true")
    );

    for (currEvent of events) {
      if (currEvent.recurrence) {
        // For recurring events, find all instances and check conflicts for each instance
        const instancesResponse = await calendar.events.instances({
          calendarId: PENDING_APPROVAL_CALENDAR_ID,
          eventId: currEvent.id,
        });
        const instances = instancesResponse.data.items;

        currEvent.instances = instances.map((e) => unpackExtendedProperties(e));
      }
    }

    events.sort((a, b) => {
      const startA = new Date(a.start.dateTime || a.start.date).getTime();
      const startB = new Date(b.start.dateTime || b.start.date).getTime();
      return startA - startB; // Ascending order (earliest first)
    });

    return events.map((event) => unpackExtendedProperties(event));
  } catch (error) {
    console.error('Error processing user events:', error.message);
    throw error; // Re-throw the error to propagate it further if needed
  }
}

// Usage example in your route
router.get('/userEvents', async (req, res) => {
  try {
    const userEmail = req.session.user.profile.emails[0].value; // Assuming you store the user's email in session
    console.log("++ /userEvents userEmail:", userEmail)
    // const events = await getUserEvents(userEmail);


    const auth = await authorize();
    const calendar = google.calendar({ version: 'v3', auth });

    const pendingEvents = await getUserEvents(calendar, PENDING_APPROVAL_CALENDAR_ID, userEmail, false);
    const approvedEvents = await getUserEvents(calendar, APPROVED_CALENDAR_ID, userEmail, false);
    const proposedEvents = await getUserEvents(calendar, PROPOSED_CHANGES_CALENDAR_ID, userEmail, false);
    const pastEvents = await getUserEvents(calendar, APPROVED_CALENDAR_ID, userEmail, true);

    console.log(">> (getUserEvents) pendingEvents", pendingEvents);
    console.log(">> (getUserEvents) approvedEvents", approvedEvents);
    console.log(">> (getUserEvents) proposedEvents", proposedEvents);
    console.log(">> (getUserEvents) pastEvents", pastEvents);

    // Combine all events into a single object
    const result = { 'pending': pendingEvents, 'approved': approvedEvents, 'proposed': proposedEvents, 'history': pastEvents };
    console.log(">> (getUserEvents) result", result);

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

    const events = response.data.items;

    // Group events by start date (YYYY-MM-DD)
    const groupedEvents = {};
    events.forEach(event => {
      const start = event.start.dateTime || event.start.date; // Support all-day events
      const dateKey = new Date(start).toISOString().split('T')[0]; // YYYY-MM-DD

      if (!groupedEvents[dateKey]) {
        groupedEvents[dateKey] = [];
      }
      groupedEvents[dateKey].push(event);
    });

    // Convert object to array format for easier frontend handling
    const formatted = Object.entries(groupedEvents).map(([date, events]) => ({
      date,
      events
    }));

    res.status(200).json(formatted);
  } catch (error) {
    console.error('Error fetching approved events:', error.message);
    res.status(500).send('Error fetching approved events: ' + error.message);
  }
});

// Fetch event details based on eventId
router.get('/eventDetails', async (req, res) => {
  const { eventId } = req.query;

  if (!eventId) {
    return res.status(400).json({ error: 'Event ID is required' });
  }

  try {
    const auth = await authorize();
    const calendar = google.calendar({ version: 'v3', auth });

    const response = await calendar.events.get({
      calendarId: APPROVED_CALENDAR_ID,
      eventId,
    });

    const eventDetails = unpackExtendedProperties(response.data);
    res.status(200).json(eventDetails);
  } catch (error) {
    console.error('Error fetching event details:', error.message);
    res.status(500).send('Error fetching event details: ' + error.message);
  }
});

// Fetch Proposed Changes events
router.get('/proposedChangesEvents', async (req, res) => {
  try {
    const { isUser } = req.query; // if left out, default is false aka is Admin
    console.log("Requester is User (not admin): ", isUser);
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
    for (const item of response.data.items) {
      console.log(item.extendedProperties);
    }

    const boolAdminApproval = isUser ? "true" : "false"; // if isUser, then adminApproval is false, otherwise true

    const events = response.data.items.filter((e) => e.extendedProperties?.private?.adminApproval === boolAdminApproval); // Filter by needsAdminApproval
    console.log("> events after filtering", events);
    const parsedEvents = events.map((event) => unpackExtendedProperties(event));
    console.log("Parsed Proposed Events", parsedEvents);
    res.status(200).json(parsedEvents);
  } catch (error) {
    console.error('Error fetching approved events:', error.message);
    res.status(500).send('Error fetching approved events: ' + error.message);
  }
});

router.get('/numPendingEvents', async (req, res) => {
  try {
    const auth = await authorize();
    const calendar = google.calendar({ version: 'v3', auth });
    const now = new Date();

    const pendingCalendar = await calendar.events.list({
      calendarId: PENDING_APPROVAL_CALENDAR_ID, // Replace with your "Pending approval" calendar ID
      singleEvents: false, // display recurring events as a single event
      timeMin: now.toISOString()
    });

    const proposedCalendar = await calendar.events.list({
      calendarId: PROPOSED_CHANGES_CALENDAR_ID,
      singleEvents: false,
      timeMin: now.toISOString()
    });

    const pendingCalendarEvents = pendingCalendar.data.items;
    const proposedCalendarEvents = proposedCalendar.data.items.filter((e) => e.extendedProperties?.private?.adminApproval === 'true');

    console.log(pendingCalendarEvents, proposedCalendarEvents);
    const num = pendingCalendarEvents.length + proposedCalendarEvents.length;

    res.status(200).json(num);
  } catch (error) {
    console.error('Error fetching number of pending events', error.message);
    res.status(500).send('Error fetching number of pending events: ' + error.message);
  }
})


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
    const targetId = roomsTools.GetCalendarIdByRoom(roomName);
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
  const rooms = await roomsTools.GetAllRooms();
  const roomNames = rooms.map((room) => room.room_name);
  const roomIds = rooms.map((room) => room.calendar_id);
  console.log(">> Room Names:", roomNames);
  console.log(">> Room IDs:", roomIds);
  const requestBody = {
    timeMin: timeMin, // ISO 8601 format
    timeMax: timeMax, // ISO 8601 format
    timeZone: "America/Los_Angeles",
    items: roomIds.map((id) => ({ id })) // calendar IDs,
  };

  const response = await calendar.freebusy.query({ requestBody });
  console.log(">> FreeBusy Response:", response.data)
  const busyRooms = response.data.calendars;
  console.log(">> Busy Rooms:", busyRooms);

  // Determine available rooms
  const availableRooms = rooms.filter((room) => {
    const calendarId = room.calendar_id;
    const roomName = room.room_name;
    return !roomList.includes(roomName) & busyRooms[calendarId]?.busy.length === 0; // Room is available if no busy times
  }).map((room) => room.room_name); // Return only room names
  console.log(">> Available Rooms:", availableRooms);

  // console.log("Available Rooms:", availableRooms);
  return availableRooms;
}

async function mapToRoomDetails(availableRooms, allEvents) {
  console.log("Getting Room Details");
  for (room of availableRooms) {
    const res = await roomsTools.GetRoomDetails(room);
    allEvents[room].details = res;
  }
  console.log("Available Rooms: ", allEvents);
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
  const { startDateTime, endDateTime, roomList, recurrence } = req.query;
  console.log(req.query)

  if (!startDateTime || !endDateTime || !roomList) {
    res.status(400).send("Missing required fields");
  }

  try {
    const auth = await authorize();
    const calendar = google.calendar({ version: 'v3', auth })

    const conflictsImproved = await checkForConflicts(JSON.parse(roomList), startDateTime, endDateTime, recurrence);
    console.log('>> New Conflict Detection Results:', conflictsImproved);
    // const conflicts = await getConflictsSimple(calendar, JSON.parse(roomList), startDateTime, endDateTime);
    // console.log('>> Old Conflict Detection Results:', conflicts);
    res.status(200).json(conflictsImproved);
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
      singleEvents: false, // recurring events will be displayed as single events
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
      console.log('pending event printed out', pendingEvent);
      const roomsStr = extendedProperties?.private?.rooms;
      console.log(`roomsStr: ${roomsStr}`);
      const roomResources = roomsStr ? JSON.parse(roomsStr).map((room) => room.email) : []; // generate list of roomIds attatched to this event
      console.log(`room resources list: ${roomResources}`);
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
  const { eventName, location, description, congregation, groupName, groupLeader, numPeople, startDateTime, endDateTime, rooms, userEmail, rRule, isAdmin, otherEmail, conflictMessage } = req.body;

  if (!eventName || !startDateTime || !endDateTime || !rooms || rooms.length === 0) {
    return res.status(400).send('Missing required fields');
  }

  console.log("RRULE: ", rRule);

  try {
    const summary = eventName
    const auth = await authorize();
    const calendar = google.calendar({ version: 'v3', auth });

    // Generate list of room attendees from rooms list (For admins only)
    const roomAttendees = await generateRoomsAttendeesList(rooms);
    console.log(roomAttendees)

    // add group leader, group name, congregation to the description
    const fullDescription = `${description}
    - Group Name: ${groupName}
    - Group Leader: ${groupLeader}
    - Congregation: ${congregation}
    - Number of People: ${numPeople}`;

    // If this is an admin request, check if they have entered an alternate email, and if so use this
    // If this is a user request, add the user's email to the attendee's list
    const eventAttendees = isAdmin ?
      [
        otherEmail && { email: otherEmail },
        ...roomAttendees
      ] :
      [
        { email: userEmail }
      ]
      ;

    // Create the event object
    const event = {
      summary,
      location,
      description: fullDescription,
      start: {
        dateTime: startDateTime,
        timeZone: 'America/Los_Angeles',
      },
      end: {
        dateTime: endDateTime,
        timeZone: 'America/Los_Angeles',
      },
      attendees: eventAttendees,
      reminders: {
        useDefault: false,
        overrides: [],
      },
      extendedProperties: {
        private: {
          ...(isAdmin
            ? { groupName, groupLeader, congregation, numPeople, conflictMessage } // Admin doesn't need room info here
            : {
              rooms: JSON.stringify(rooms), // Non-admin requests stores room info here to avoid creating conflicts in the calendar prior to approval
              groupName,
              groupLeader,
              congregation,
              numPeople,
              conflictMessage
            }),
        },
      }
    };


    console.log("Event Details", event);

    const eventIsRecurring = !rRule.includes('FREQ=;UNTIL');
    if (eventIsRecurring) { // Check if the rRule is valid >> if it is not, then we do not add the recurrence rule
      event.recurrence = [`RRULE:${rRule}`]
    }

    const calId = isAdmin ? APPROVED_CALENDAR_ID : PENDING_APPROVAL_CALENDAR_ID;

    const response = await calendar.events.insert({
      calendarId: calId,
      resource: event,
    });

    console.log('Event created: %s', response.data.htmlLink);

    // Prepare email data using Luxon
    const userName = req.session.user.profile.displayName;

    if (isAdmin) {
      // Send confirmation email (non-blocking)
      sendReservationApprovedEmail(userEmail, userName, summary, startDateTime, endDateTime, rooms, response.data.htmlLink, eventIsRecurring)
        .then(() => console.log('Email sent'))
        .catch((emailError) => console.error('Error sending email:', emailError));

    } else {
      // Send confirmation email (non-blocking)
      sendReservationReceivedEmail(userEmail, userName, summary, startDateTime, endDateTime, rooms, response.data.htmlLink, eventIsRecurring)
        .then(() => console.log('Email sent'))
        .catch((emailError) => console.error('Error sending email:', emailError));
    }

    // console.log('Email sent');
    res.status(200).send('Event added');
  } catch (error) {
    console.error('Error adding event:', error);
    res.status(500).send('Error adding event: ' + error.message);
  }
});

// New Approval Method (moves event to approved calendar, then updates it to add rooms [as attendees] and remove unneeded extended properties)
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
      const roomList = JSON.parse(movedEvent.data.extendedProperties?.private?.rooms || "[]");
      const roomAttendees = await generateRoomsAttendeesList(roomList);
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


// Partially approve a recurring event: move non-conflicting instances to approved calendar, keep conflicts in pending
router.post('/partiallyApproveRecurringEvent', async (req, res) => {
  const { eventId, message } = req.body;
  if (!eventId) {
    return res.status(400).send('Missing required fields');
  }
  try {
    const auth = await authorize();
    const calendar = google.calendar({ version: 'v3', auth });

    // 1. Get the original event from the pending calendar
    const eventResponse = await calendar.events.get({
      calendarId: PENDING_APPROVAL_CALENDAR_ID,
      eventId,
    });
    const event = eventResponse.data;

    if (!event.recurrence) {
      return res.status(400).send('Event is not recurring. Use normal approval.');
    }

    // 2. Get all instances of the recurring event
    const instancesResponse = await calendar.events.instances({
      calendarId: PENDING_APPROVAL_CALENDAR_ID,
      eventId,
    });
    const instances = instancesResponse.data.items;

    // 3. For each instance, check for conflicts in the approved calendar
    const roomResources = JSON.parse(event.extendedProperties.private.rooms).map((room) => room.email);
    const nonConflictingDates = [];
    const conflictingInstances = [];
    for (const instance of instances) {
      const conflicts = await getConflictsSimple(calendar, roomResources, instance.start.dateTime, instance.end.dateTime);
      if (conflicts.length === 0) {
        nonConflictingDates.push(instance.start.dateTime);
      } else {
        conflictingInstances.push(instance);
      }
    }

    // 4. If all instances are conflicting, do not approve
    if (nonConflictingDates.length === 0) {
      return res.status(409).send('All instances are conflicting. Nothing to approve.');
    }

    // 5. Build EXDATE list for conflicting dates
    const exdates = conflictingInstances.map(inst => {
      // Google Calendar expects EXDATE in UTC format: YYYYMMDDTHHmmssZ
      const dt = new Date(inst.start.dateTime);
      return dt.toISOString().replace(/[-:]/g, '').replace('.000', '').replace('T', 'T').replace('Z', 'Z');
    });

    // 6. Move the event to the approved calendar, adding EXDATEs for conflicts
    //    (Google Calendar API: update recurrence rule with EXDATE)
    let newRecurrence = event.recurrence.slice();
    if (exdates.length > 0) {
      // Add EXDATEs for each conflict
      const exdateStr = 'EXDATE;TZID=America/Los_Angeles:' + conflictingInstances.map(inst => {
        // Format: YYYYMMDDTHHmmss
        const dt = new Date(inst.start.dateTime);
        // Remove dashes and colons, keep local time
        const local = dt.toLocaleString('sv-SE', { timeZone: 'America/Los_Angeles' }).replace(/[-:]/g, '').replace(' ', 'T');
        return local;
      }).join(',');
      newRecurrence.push(exdateStr);
    }

    // Move the event to the approved calendar
    const movedEvent = await calendar.events.move({
      calendarId: PENDING_APPROVAL_CALENDAR_ID,
      eventId,
      destination: APPROVED_CALENDAR_ID,
    });

    // Update the moved event with new recurrence (EXDATE) and attendees
    // const roomAttendees = JSON.parse(movedEvent.data.extendedProperties?.private?.rooms || '[]');
    const roomList = JSON.parse(movedEvent.data.extendedProperties?.private?.rooms || "[]");
    const roomAttendees = await generateRoomsAttendeesList(roomList);

    const updatedRequestBody = {
      summary: movedEvent.data.summary,
      description: movedEvent.data.description,
      start: movedEvent.data.start,
      end: movedEvent.data.end,
      extendedProperties: movedEvent.data.extendedProperties || {},
      attendees: [...(movedEvent.data.attendees || []), ...roomAttendees],
      recurrence: newRecurrence,
    };
    const updatedEvent = await calendar.events.update({
      calendarId: APPROVED_CALENDAR_ID,
      eventId: movedEvent.data.id,
      requestBody: updatedRequestBody,
    });

    // 7. For each conflicting instance, create a new single event in the pending calendar
    let createdCount = 0;
    for (const inst of conflictingInstances) {
      // Remove recurrence properties for single event
      const newEvent = {
        summary: `${event.summary} [SEPARATED DUE TO CONFLICT ${++createdCount}/${conflictingInstances.length}]`, // Indicate this is a separated instance
        description: event.description,
        start: inst.start,
        end: inst.end,
        attendees: event.attendees,
        extendedProperties: event.extendedProperties,
      };
      await calendar.events.insert({
        calendarId: PENDING_APPROVAL_CALENDAR_ID,
        resource: newEvent,
      });
    }


    // 8. Send partial approval email for the approved part, including conflicts
    const { sendReservationPartiallyApprovedEmail } = require('./utils/sendEmail');
    const emailDetails = extractEventDetailsForEmail(updatedEvent.data);
    sendReservationPartiallyApprovedEmail(
      emailDetails.userEmail,
      emailDetails.userName,
      emailDetails.eventName,
      emailDetails.eventStart,
      emailDetails.eventEnd,
      emailDetails.roomNames,
      conflictingInstances,
      message,
      emailDetails.htmlLink
    ).catch((err) => console.error('Email sending failed:', err));

    res.status(200).json({
      approvedEvent: updatedEvent.data,
      numConflictingInstances: conflictingInstances.length,
      numApprovedInstances: nonConflictingDates.length,
    });
  } catch (error) {
    console.error('Error partially approving recurring event:', error);
    res.status(500).send('Error partially approving recurring event: ' + error.message);
  }
});

// Move event from the "Pending approval" Calendar to the "approved" Calendar
router.post('/approveEvent', async (req, res) => {
  const { eventId, message } = req.body;

  if (!eventId) {
    return res.status(400).send('Missing required fields');
  }

  try {
    const auth = await authorize();
    const calendar = google.calendar({ version: 'v3', auth });

    // Retrieve the event details from the "Pending approval" calendar
    const data = await moveAndUpdateEvent(eventId, calendar, PENDING_APPROVAL_CALENDAR_ID, APPROVED_CALENDAR_ID);

    const emailDetails = extractEventDetailsForEmail(data);
    sendReservationApprovedEmail(
      emailDetails.userEmail,
      emailDetails.userName,
      emailDetails.eventName,
      emailDetails.eventStart,
      emailDetails.eventEnd,
      emailDetails.roomNames,
      message,
      emailDetails.htmlLink
    ).catch((err) => console.error('Email sending failed:', err));

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
      const data = await moveAndUpdateEvent(eventId, calendar, PENDING_APPROVAL_CALENDAR_ID, APPROVED_CALENDAR_ID);

      const emailDetails = extractEventDetailsForEmail(data);

      sendReservationApprovedEmail(
        emailDetails.userEmail,
        emailDetails.userName,
        emailDetails.eventName,
        emailDetails.eventStart,
        emailDetails.eventEnd,
        emailDetails.roomNames,
        emailDetails.htmlLink
      ).catch((err) => console.error('Email sending failed:', err));;
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

      const emailDetails = extractEventDetailsForEmail(updatedEvent.data);
      sendReservationEditedEmail(
        emailDetails.userEmail,
        emailDetails.userName,
        emailDetails.eventName,
        emailDetails.eventStart,
        emailDetails.eventEnd,
        emailDetails.roomNames,
        emailDetails.htmlLink
      ).then(() => console.log('Email sent successfully in the background'))
        .catch((err) => console.error('Fire-and-forget email error:', err));

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

// Check Availability of rooms given a certain time frame
// Returns list of available rooms
const checkAvailability = async (startDateTime, endDateTime, rRule) => {
  if (!startDateTime || !endDateTime) {
    throw new Error('Missing startDateTime or endDateTime');
  }
  // console.log('Times:', startDateTime, endDateTime, new Date(startDateTime).toISOString());

  const conflicts = await checkForConflicts([], startDateTime, endDateTime, rRule);
  const roomNames = await getRoomNamesFromCalendarIds(conflicts);
  console.log(">> checkAvailability: ", roomNames);
  return roomNames;
};

// Check what rooms are available at any given time/date
router.get('/checkAvailability', async (req, res) => {
  const { startDateTime, endDateTime } = req.query;

  try {
    const busyRooms = await checkAvailability(startDateTime, endDateTime);
    const allRooms = (await roomsTools.GetAllRooms()).map((room) => room.room_name);
    console.log("Busy Rooms:", busyRooms);
    console.log("All Rooms:", allRooms);
    const availableRooms = allRooms.filter((room) => !busyRooms.includes(room));
    console.log("Available Rooms:", availableRooms);

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
    const busyRooms = await checkAvailability(startDateTime, endDateTime);
    const matchingRooms = await roomsTools.SearchRoom(capacity, resources);
    console.log("CheckAvailability:", busyRooms);

    const matchingRoomsNames = matchingRooms.map((elem) => {
      return elem.room_name;
    })
    console.log("roomsTools.SearchRoom => Names:", matchingRoomsNames);
    const merged = matchingRoomsNames.filter((room) => {
      return !busyRooms?.includes(room);
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
        overrides: [],
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

// Reject a pending Event (delete?) might need to change this in the future to move to rejected calendar
router.delete('/rejectEvent', async (req, res) => {
  try {
    const { eventId, calendarId } = req.body;
    console.log("Event ID to delete:", eventId);
    console.log("Calendar ID:", calendarId);

    if (!eventId || !calendarId) {
      return res.status(400).json({ error: 'Missing eventId or calendarId in request body' });
    }
    const auth = await authorize();
    const calendar = google.calendar({ version: 'v3', auth });

    await calendar.events.delete({
      calendarId: calendarId, // Pending Calendar ID
      eventId: eventId, // Event ID
    });

    const userName = req.session.user.profile.displayName;
    const userEmail = req.session.user.profile.emails[0];
    sendReservationCanceledEmail(userEmail, userName, eventId).catch((err) => console.error('Error sending email:', err));

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