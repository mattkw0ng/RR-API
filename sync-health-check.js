const pool = require('./db');
const { syncAllCalendarsOnStartup } = require('./utils/webhook-utils');

/**
 * Utility script to check database sync health and manually trigger syncs
 * Usage: node sync-health-check.js [command]
 * 
 * Commands:
 *   check    - Show sync status (default)
 *   sync     - Force full sync from Google Calendar
 *   clear    - Clear all events from database
 */

async function getSyncHealth() {
  try {
    console.log("\n📊 SYNC HEALTH CHECK");
    console.log("=".repeat(60));

    // Check event counts per calendar
    const eventQuery = `
      SELECT calendar_id, COUNT(*) as event_count, MAX(updated_at) as last_updated
      FROM events
      GROUP BY calendar_id
      ORDER BY calendar_id
    `;
    const { rows: eventRows } = await pool.query(eventQuery);
    
    console.log("\n📅 Events in Database:");
    if (eventRows.length === 0) {
      console.log("   ⚠️  No events found! Database may be empty.");
    } else {
      let totalEvents = 0;
      eventRows.forEach(row => {
        const lastUpdated = new Date(row.last_updated);
        const hoursSince = (Date.now() - lastUpdated) / (1000 * 60 * 60);
        const status = hoursSince < 24 ? "✅" : "⚠️";
        console.log(`   ${status} ${row.calendar_id}: ${row.event_count} events (updated ${hoursSince.toFixed(1)}h ago)`);
        totalEvents += row.event_count;
      });
      console.log(`   Total: ${totalEvents} events\n`);
    }

    // Check sync token status
    const tokenQuery = `
      SELECT calendar_id, sync_token, updated_at
      FROM google_sync_tokens
      ORDER BY calendar_id
    `;
    const { rows: tokenRows } = await pool.query(tokenQuery);
    
    console.log("🔄 Sync Tokens:");
    if (tokenRows.length === 0) {
      console.log("   ⚠️  No sync tokens found!");
    } else {
      tokenRows.forEach(row => {
        const lastSync = new Date(row.updated_at);
        const hoursSince = (Date.now() - lastSync) / (1000 * 60 * 60);
        const status = hoursSince < 1 ? "✅" : (hoursSince < 24 ? "⚠️" : "❌");
        const tokenPreview = row.sync_token ? row.sync_token.substring(0, 20) + "..." : "NULL";
        console.log(`   ${status} ${row.calendar_id}`);
        console.log(`      Last sync: ${hoursSince.toFixed(1)}h ago`);
        console.log(`      Token: ${tokenPreview}`);
      });
    }

    // Check webhook mappings
    const watchQuery = `
      SELECT resource_id, calendar_id, channel_id, created_at
      FROM watch_mapping
      ORDER BY calendar_id
    `;
    const { rows: watchRows } = await pool.query(watchQuery);
    
    console.log("\n📡 Webhook Watches:");
    if (watchRows.length === 0) {
      console.log("   ⚠️  No active webhooks!");
    } else {
      watchRows.forEach(row => {
        const created = new Date(row.created_at);
        const daysSince = (Date.now() - created) / (1000 * 60 * 60 * 24);
        console.log(`   ✅ ${row.calendar_id}`);
        console.log(`      Channel: ${row.channel_id.substring(0, 20)}...`);
        console.log(`      Active for: ${daysSince.toFixed(1)} days`);
      });
    }

    console.log("\n" + "=".repeat(60) + "\n");

  } catch (error) {
    console.error("Error checking sync health:", error);
  }
}

async function forceSync() {
  try {
    console.log("\n🔄 FORCING FULL SYNC FROM GOOGLE CALENDAR...");
    console.log("This will truncate all events and re-fetch from Google.\n");
    
    await syncAllCalendarsOnStartup();
    
    console.log("✅ Sync completed!\n");
    await getSyncHealth();
  } catch (error) {
    console.error("Error during sync:", error);
  }
}

async function clearDatabase() {
  try {
    console.log("\n⚠️  WARNING: This will delete ALL events from the database!");
    console.log("Call forceSync() afterward to restore events.\n");
    
    await pool.query("TRUNCATE TABLE events");
    console.log("✅ All events cleared!\n");
  } catch (error) {
    console.error("Error clearing database:", error);
  }
}

async function main() {
  const command = process.argv[2] || 'check';

  switch (command) {
    case 'check':
      await getSyncHealth();
      break;
    case 'sync':
      await forceSync();
      break;
    case 'clear':
      await clearDatabase();
      break;
    default:
      console.log(`Unknown command: ${command}`);
      console.log("Available commands: check, sync, clear");
  }

  process.exit(0);
}

main().catch(error => {
  console.error("Fatal error:", error);
  process.exit(1);
});
