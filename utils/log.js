const path = require('path');


function getCallerInfo() {
  const stack = new Error().stack.split('\n');
  let callerLine = '';
  for (let i = 2; i < stack.length; i++) {
    if (!stack[i].includes('log.js')) {
      callerLine = stack[i];
      break;
    }
  }
  // Try to extract file, line, and column
  const match = callerLine.match(/at (?:([^ ]+) )?\(?([^:]+):(\d+):(\d+)\)?/);
  if (match) {
    const func = match[1] || 'anonymous';
    const file = path.basename(match[2]);
    const line = match[3];
    return { func, file, line };
  }
  return { func: 'unknown', file: 'unknown', line: '?' };
}

/**
 * Logs a message at the specified level with optional indentation.
 * Accepts any number of arguments, objects are pretty-printed.
 * @param {string} level - Log level (info, warn, error, debug)
 * @param {number} indent - Indentation level (number of 2-space indents)
 * @param {...any} args - Message and additional data to log
 */
function log(level, indent, ...args) {
  const { func, file, line } = getCallerInfo();
  const prefix = `[${level.toUpperCase()}][${file}:${line}|(${func})]`;
  const indentation = ' '.repeat(indent * 2);
  // Format all args as string, join with space
  const message = args.map(arg => {
    if (typeof arg === 'object') {
      try {
        return JSON.stringify(arg, null, 2);
      } catch {
        return String(arg);
      }
    }
    return String(arg);
  }).join(' ');
  console.log(`\n${indentation}${prefix}\n${message}\n${prefix}`);
}


/**
 * Permanently logs a user activity to the database (activity_logs).
 * @async
 * @param {string} action - Description of the action performed
 * @param {any} details - Additional details about the action (object/string)
 * @param {object} req - Express request object (for user/session info)
 * @param {string|null} eventId - Optional event ID related to the action
 */
async function track(action, details, req, eventId = null) {
  try {
    const userId = req.session?.user?.profile.id || null;
    const userName = req.session?.user?.profile.displayName || 'Anonymous';
    const userEmail = req.session?.user?.profile.emails?.[0]?.value || 'No email';
    await pool.query(
      `INSERT INTO activity_logs (user_id, action, details, route, method, user_name, user_email, event_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [userId, action, JSON.stringify(details), req.originalUrl, req.method, userName, userEmail, eventId]
    );
    log('info', `track: activity logged`);
  } catch (err) {
    log('error', `track: Failed to log activity: ${err.message}`);
  }
}

/**
 * Permanently logs an error to the database (error_logs).
 * @async
 * @param {string} message - Error message
 * @param {Error|any} error - Error object (stack trace will be logged if present)
 * @param {object} req - Express request object (for route/method info)
 */
async function trackError(message, error, req) {
  try {
    await pool.query(
      `INSERT INTO error_logs (message, stack, route, method)
       VALUES ($1, $2, $3, $4)`,
      [message, error?.stack || '', req.originalUrl, req.method]
    );
    log('info', `track: error logged`);
  } catch (err) {
    log('error', `track: Failed to log error: ${err.message}`);
  }
}

module.exports = {
  info: (...args) => log('info', 0, ...args), // Indent info logs by default (2*2=4 spaces)
  warn: (...args) => log('warn', 0, ...args),
  error: (...args) => log('error', 0, ...args),
  debug: (...args) => log('debug', 0, ...args),
  track,
  trackError
};
// Clean export: only the logging utility