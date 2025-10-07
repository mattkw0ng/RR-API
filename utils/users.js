const pool = require('../db');

/**
 * Upserts a user into the database.
 * @param {Object} user - User object containing email, name, googleId, and role.
 * @returns {Promise<void>}
 */
const upsertUser = async (user) => {
  const { email, name, googleId, role = "user" } = user;

  if (!email) {
    throw new Error("Email is required for adding a user.");
  }

  const query = `
    INSERT INTO users (email, name, google_id, role)
    VALUES ($1, $2, $3, $4)
    ON CONFLICT (email)
    DO NOTHING
    RETURNING *;
  `;

  const values = [email, name, googleId, role];

  try {
    const result = await pool.query(query, values);
    if (result.rows.length > 0) {
      log.info("Inserted new user:", result.rows[0]);
      return result.rows[0]; // Return the inserted user
    } else {
      log.info("User already exists, no action taken.");
      return null; // Return null if the user already exists
    }
  } catch (error) {
    log.error("Error adding user:", error);
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
    log.info('Selected User: ', result.rows[0]);
    return result.rows[0]
  } catch (err) {
    log.error("Error getting user by email: ", err);
    throw err;
  }
}

const updateUserRole = async (email, role) => {
  const query = "UPDATE users SET role = $1 WHERE email = $2";
  const values = [role, email];

  try {
    await pool.query(query, values);
    log.info(`Updated ${email} to role ${role}`);
  } catch (error) {
    log.error("Error updating user role:", error);
    throw error;
  }
};

module.exports = {
  upsertUser,
  getUserByEmail,
  updateUserRole
}