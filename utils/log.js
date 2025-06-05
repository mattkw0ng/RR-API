const pool = require('../db'); // Adjust the path as necessary

/**
 * Table Schema for activity logs
 * 
  TABLE activity_logs (
  id SERIAL PRIMARY KEY,
  user_id INTEGER REFERENCES users(id),
  action TEXT NOT NULL,
  details JSONB,
  timestamp TIMESTAMPTZ DEFAULT NOW(),
  route TEXT,
  method TEXT,
  user_name TEXT,
  user_email TEXT,
  event_id TEXT
  );
 */

// Function to log event methods (add, update, delete)

const logEventMethod = async (eventId, action, req) => {
  try {
    const userId = req.session?.user?.profile.id || null; // Assuming Passport or session stores user
    const userName = req.session?.user?.profile.displayName || 'Anonymous';
    const userEmail = req.session?.user?.profile.emails?.[0]?.value || 'No email';
    
    await pool.query(
      `INSERT INTO activity_logs (user_id, action, details, route, method, user_name, user_email, event_id)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [userId, action, {}, req.originalUrl, req.method, userName, userEmail, eventId]
    );
  } catch (err) {
    console.error("Failed to log event method:", err.message);
  }
}

const logError = async (error, req) => {
  try {
    await pool.query(
      `INSERT INTO error_logs (message, stack, route, method)
         VALUES ($1, $2, $3, $4)`,
      [error.message, error.stack, req.originalUrl, req.method]
    );
  } catch (err) {
    console.error("Failed to log error:", err.message);
  }
};

module.exports = {
  logEventMethod,
  logError
}