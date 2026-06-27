const express = require('express');
const bodyParser = require('body-parser');
const { getStoredSyncToken, syncCalendarChanges, getCalendarIdByResourceId } = require('../utils/webhook-utils')

const router = express.Router();
router.use(bodyParser.json());

router.post('/webhook', async (req, res) => {
  console.log("Webhook received:", req.headers);

  const resourceState = req.headers['x-goog-resource-state'];
  const resourceId = req.headers['x-goog-resource-id'];
  const channelId = req.headers['x-goog-channel-id'];
  console.log("Resource ID: ", resourceId);

  const calendarId = await getCalendarIdByResourceId(resourceId, channelId);

  if (!calendarId) {
    console.error("No calendar found for resource ID:", resourceId, " or calendar ID: ", channelId);
    return res.status(400).send("Invalid resource ID or channel ID");
  }

  // 1. Send the 200 OK immediately so Google knows the message was delivered successfully
  res.status(200).send("Acknowledged");

  // 2. Safely grab the sync token
  const syncToken = await getStoredSyncToken(calendarId);

  // 3. Process the changes asynchronously in the background (Notice: no 'await' before syncCalendarChanges)
  if (resourceState === 'sync') {
    console.log(`[Webhook] Initial sync handshake initiated for calendar: ${calendarId}`);
    syncCalendarChanges(syncToken, calendarId).catch(err => {
      console.error(`❌ Background initial sync failed for ${calendarId}:`, err);
    });
  } else {
    console.log(`[Webhook] Event change detected. Processing delta for calendar: ${calendarId}`);
    syncCalendarChanges(syncToken, calendarId).catch(err => {
      console.error(`❌ Background delta sync failed for ${calendarId}:`, err);
    });
  }
});

module.exports = router;
