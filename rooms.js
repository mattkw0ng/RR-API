const express = require('express');
const router = express.Router();
const pool = require('./db');
const path = require('path');
const fs = require('fs');

const ROOM_IDS_PATH = path.join(__dirname, 'room-ids.json');
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

// TEST : get room data from database
router.get('/rooms', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM rooms');
    res.json(result.rows);
  } catch (err) {
    console.error(err.message);
    res.status(500).send('Server Error');
  }
});

router.post('/searchRoomBasic', async (req, res) => {
  const { capacity, resources } = req.body;
  console.log(`Searching Rooms where capacity >= ${capacity} and room includes: ${resources}`);

  if (!capacity || !resources) {
    return res.status(400).send('Missing required fields');
  }

  try {
    const result = await pool.query(
      `SELECT * FROM rooms WHERE capacity >= $1 AND resources @> $2::text[]`,
      [capacity, resources]
    );
    console.log(result);
    res.json(result.rows);
  } catch (err) {
    console.error(err.message);
    res.status(500).send('Server Error');
  }
});

module.exports = router;