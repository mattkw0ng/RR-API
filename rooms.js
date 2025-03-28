const express = require('express');
const router = express.Router();
const pool = require('./db');
const path = require('path');
const fs = require('fs');

const ROOM_IDS_PATH = path.join(__dirname, 'json/room-ids.json');
const ROOM_IDS = JSON.parse(fs.readFileSync(ROOM_IDS_PATH, 'utf-8'));

// Get calendar ID from database (currently unimplemented)
async function getCalendarIdByRoom(room) {
  // const query = 'SELECT calendar_id FROM rooms WHERE name = $1';
  // const result = await pool.query(query, [room]);
  // if (result.rows.length > 0) {
  //   return result.rows[0].calendar_id;
  // }
  // throw new Error(`Room not found: ${room}`);
  return ROOM_IDS[room]
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

module.exports = {
  router,
  SearchRoom,
  GetRoomByName,
  GetRoomById,
};