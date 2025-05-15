const express = require('express');
const router = express.Router();
const pool = require('./db');
const path = require('path');
const fs = require('fs');

const ROOM_IDS_PATH = path.join(__dirname, 'json/room-ids.json');
const ROOM_IDS = JSON.parse(fs.readFileSync(ROOM_IDS_PATH, 'utf-8'));

async function GetCalendarIdByRoom(room) {
  console.log("Getting calendar ID for room:", room);
  const query = 'SELECT calendar_id FROM rooms WHERE name = $1';
  const result = await pool.query(query, [room]);
  if (result.rows.length > 0) {
    return result.rows[0].calendar_id;
  }
  throw new Error(`Room not found: ${room}`);
}

async function SearchRoom(capacity, resources) {
  capacity = capacity ? Number(capacity) : 0;
  const result = await pool.query(
    `SELECT * FROM rooms WHERE capacity >= $1 AND resources @> $2::text[]`,
    [capacity, resources]
  );
  // console.log(result);
  return(result.rows);
}

async function GetRoomByName(roomName) {
  const result = await pool.query(
    `SELECT * FROM rooms WHERE room_name = $1`, [roomName]
  );
  return(result.rows[0]);
}

async function GetRoomById(roomId) {
  const result = await pool.query(
    `SELECT * FROM rooms WHERE calendar_id = $1`, [roomId]
  );
  return(result.rows[0])
}

async function GetAllRooms() {
  const result = await pool.query(
    `SELECT * FROM rooms`
  );
  return(result.rows);
}

// TEST : get room data from database
router.get('/rooms-simple', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM rooms');
    res.json(result.rows);
  } catch (err) {
    console.error(err.message);
    res.status(500).send('Server Error');
  }
});

router.get('/rooms', async (req, res) => {
  try {
    // Query the database for room data
    const result = await pool.query('SELECT * FROM rooms');

    // Transform the data into the desired format
    const rooms = {};
    const roomsGrouped = {};
    const roomListSimple = [];
    
    result.rows.forEach((room) => {
      rooms[room.room_name] = {
        resources: room.resources ? room.resources : [],
        capacity: room.capacity,
        calendarID: room.calendar_id
      };
      roomListSimple.push(room.room_name);

      // Group rooms by building location
      if (!roomsGrouped[room.building_location]) {
        roomsGrouped[room.building_location] = [];
      }
      roomsGrouped[room.building_location].push(room.room_name);
    });

    res.json({ rooms, roomsGrouped, roomListSimple });
  } catch (err) {
    console.error('Error fetching rooms:', err);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});


router.post('/searchRoomBasic', async (req, res) => {
  const { capacity, resources } = req.body;
  console.log(`Searching Rooms where capacity >= ${capacity} and room includes: ${resources}`);

  if (!capacity || !resources) {
    return res.status(400).send('Missing required fields');
  }

  const result = await SearchRoom(capacity, resources);
  if (result) {
    res.json(result);
  } else {
    res.status(500).send('Server Error')
  }
  

  try {
    const result = await SearchRoom(capacity, resources);
    console.log(result);
    res.json(result);
  } catch (err) {
    console.error(err.message);
    res.status(500).send('Server Error');
  }
});

router.post('/addRoom', async (req, res) => {
  const { room_name, calendar_id, capacity, resources, building_location } = req.body;

  // Basic Validation
  if (!room_name || !calendar_id || !building_location) {
    return res.status(400).json({error: "Missing required fields (room name, calendar id, or building location"});
  }

  if (!Array.isArray(resources)) {
    return res.status(400).json({error: "The 'resources' field must be an array of strings"});
  }

  if (!calendar_id.endsWith('@resource.calendar.google.com')) {
    return res.status(400).json({error: "Invalid calendar_id format"});
  }

  try {
    const insertQuery =`
      INSERT INTO rooms (room_name, calendar_id, capacity, resources, building_location)
      VALUES ($1, $2, $3, $4, $5)
      RETURNING *
    `;
    const values = [room_name, calendar_id, capacity || 15, resources, building_location]; // capacity will default to 15 if it is left null
    const result = await pool.query(insertQuery, values);
    res.status(201).json({message: "Room added successfully", room: result.rows[0] });
  } catch (error) {
    console.error("Error adding room", error);
    res.status(500).json({ error: "Internal server error"});
  }
})

module.exports = {
  router,
  SearchRoom,
  GetRoomByName,
  GetRoomById,
  GetAllRooms,
  GetCalendarIdByRoom,
};