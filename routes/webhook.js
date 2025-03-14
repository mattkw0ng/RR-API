const express = require('express');
const bodyParser = require('body-parser');
const { getStoredSyncToken, syncCalendarChanges, getCalendarIdByResourceId } = require('../utils/webhook-utils')

const router = express.Router();
router.use(bodyParser.json());

router.post('/webhook', async (req, res) => {
  console.log("Webhook received:", req.headers);

  const resourceState = req.headers['x-goog-resource-state'];
  const resourceId = req.headers['x-goog-resource-id'];
  const channelId = req.headers['x-goog-channel-id']
  console.log("Resource ID: ", resourceId);

  const calendarId = await getCalendarIdByResourceId(resourceId, channelId);

  if (!calendarId) {
    console.error("No calendar found for resource ID:", resourceId, " or calendar ID: ", channelId);
    return res.status(400).send("Invalid resource ID or channel ID");
  }

  console.log(`Syncing changes for calendar ID: ${calendarId}`);

  const syncToken = await getStoredSyncToken(calendarId); // Retrieve last sync token from DB

  if (resourceState === 'sync') {
    console.log("Google Calendar Sync Needed");
    await syncCalendarChanges(syncToken, calendarId);
  } else {
    console.log("Change detected, updating events...");
    await syncCalendarChanges(syncToken, calendarId);
  }

  res.status(200).send(); // Always respond with 200 OK
});

module.exports = router;
