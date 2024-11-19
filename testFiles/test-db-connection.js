const { Client } = require('pg');
const pool = require('../db');

// Create a new client instance
const client = new Client({
  host: 'localhost', // Replace with your EC2 instance endpoint or IP
  port: 5432, // Default PostgreSQL port
  user: 'roomres', // Replace with your PostgreSQL username
  password: 'Empower2k', // Replace with your PostgreSQL password
  database: 'room_reservation' // Replace with your PostgreSQL database name
});

// Function to test the connection and query the rooms table
const testDbConnection = async () => {
  try {
    // Connect to the database
    await client.connect();
    console.log('Connected to PostgreSQL database!');

    // Query a room from the rooms table
    const res = await client.query('SELECT * FROM rooms LIMIT 1;');
    
    // Print the result to the console
    console.log('Room data:', res.rows[0]);

    // Close the connection
    await client.end();
    console.log('Connection closed.');
  } catch (err) {
    console.error('Error connecting to the database:', err.stack);
  }
};

const testDbConnection2 = async () => {
  const result = await pool.query('SELECT * FROM rooms WHERE capacity <= 100');
  console.log(result);
}

// Run the function
testDbConnection();
testDbConnection2();
