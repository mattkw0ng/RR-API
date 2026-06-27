const cron = require('node-cron');
const pool = require('./db'); // Path to your db pool file

/**
 * Retention Pruning Query
 */
async function pruneExpiredEvents() {
  console.log("[CRON] 🧹 Running scheduled database retention pruning...");
  try {
    // Purges anything that ended more than 7 days ago
    const result = await pool.query(
      `DELETE FROM events 
       WHERE end_time < NOW() - INTERVAL '7 days'`
    );
    console.log(`[CRON] ✅ Retention complete. Removed ${result.rowCount} expired events.`);
  } catch (error) {
    console.error("[CRON] ❌ Failed to prune expired calendar data:", error);
  }
}

// =========================================================================
// SCHEDULE DEFINITIONS (Choose ONE of the schedules below)
// =========================================================================

// OPTION A: Run EVERY NIGHT at Midnight (00:00) - Recommended
cron.schedule('0 0 * * *', () => {
  pruneExpiredEvents();
});

// OPTION B: Run EVERY SUNDAY at Midnight (00:00)
// cron.schedule('0 0 * * 0', () => {
//   pruneExpiredEvents();
// });

console.log("⏰ Background cron engines initialized successfully.");