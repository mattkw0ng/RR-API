const express = require('express');
const bodyParser = require('body-parser');
const { getStoredSyncToken, syncCalendarChanges } = require('../utils/webhook-utils')

const router = express.Router();
router.use(bodyParser.json());

router.post('/webhook', async (req, res) => {
  console.log("Webhook received:", req.headers);

  const resourceState = req.headers['x-goog-resource-state'];
  const syncToken = await getStoredSyncToken(); // Retrieve last sync token from DB

  if (resourceState === 'sync') {
    console.log("Google Calendar Sync Needed");
    await syncCalendarChanges(syncToken);
  } else {
    console.log("Change detected, updating events...");
    await syncCalendarChanges(syncToken);
  }

  res.status(200).send(); // Always respond with 200 OK
});

module.exports = router;
