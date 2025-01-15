const pool = require('./db');

/**
 * Upserts a user into the database.
 * @param {Object} user - User object containing email, name, googleId, and role.
 * @returns {Promise<void>}
 */
const upsertUser = async (user) => {
  const { email, name, googleId, role = "user" } = user;

  if (!email) {
    throw new Error("Email is required for upserting a user.");
  }

  const query = `
    INSERT INTO users (email, name, google_id, role)
    VALUES ($1, $2, $3, $4)
    ON CONFLICT (email)
    DO UPDATE SET
      name = EXCLUDED.name,
      google_id = EXCLUDED.google_id,
      role = EXCLUDED.role
    RETURNING *;
  `;

  const values = [email, name, googleId, role];

  try {
    const result = await pool.query(query, values);
    console.log("Upserted user:", result.rows[0]);
    return result.rows[0]; // Return the upserted user if needed
  } catch (error) {
    console.error("Error upserting user:", error);
    throw error;
  }
};

const getUserByEmail = async (userEmail) => {
  if (!userEmail) {
    throw new Error("User Email is required");
  }

  const query = `SELECT * FROM users WHERE email = $1`;
  const values = [userEmail]

  try {
    const result = await pool.query(query, values);
    console.log('Selected User: ', result.rows[0]);
    return result.rows[0]
  } catch (err) {
    console.error("Error getting user by email: ", err);
    throw err;
  }
}


module.exports = {
  upsertUser,
  getUserByEmail,
}