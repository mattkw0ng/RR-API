const express = require("express");
const router = express.Router();
const { sendReservationReceivedEmail } = require("../utils/sendEmail");

// Route to send a reservation confirmation email
router.post("/send-reservation-email", async (req, res) => {
  const { userEmail, userName, eventName, startDateTime, endDateTime, roomNames } = req.body;

  // Validate the required fields
  if (!userEmail || !userName || !eventName || !startDateTime || !endDateTime || !roomNames || roomNames.length === 0) {
    return res.status(400).send("Missing required fields.");
  }

  try {
    // Format the date and time
    const eventDate = new Date(startDateTime).toLocaleDateString("en-US", {
      weekday: "long",
      year: "numeric",
      month: "long",
      day: "numeric",
    });
    const eventTime = `${new Date(startDateTime).toLocaleTimeString([], {
      hour: "2-digit",
      minute: "2-digit",
    })} - ${new Date(endDateTime).toLocaleTimeString([], {
      hour: "2-digit",
      minute: "2-digit",
    })}`;

    // Send the reservation confirmation email
    await sendReservationReceivedEmail(userEmail, userName, eventName, eventDate, eventTime, roomNames);

    // Respond with success
    res.status(200).send("Reservation confirmation email sent successfully.");
  } catch (error) {
    console.error("Error sending reservation email:", error);
    res.status(500).send("Error sending reservation email.");
  }
});

router.get("/test-reservation-email", async (req, res) => {
  try {
    // Dummy data
    const userEmail = "mattkwong52@gmail.com";
    const userName = "Test User";
    const eventName = "Test Event";
    const eventDate = "Friday, December 15, 2024"; // Manually formatted for simplicity
    const eventTime = "10:00 AM - 12:00 PM";
    const roomNames = ["Sanctuary", "A101"];

    // Call the email function
    await sendReservationReceivedEmail(userEmail, userName, eventName, eventDate, eventTime, roomNames);

    console.log("Test email sent successfully.");
    res.status(200).send("Test email sent successfully.");
  } catch (error) {
    console.error("Error sending test email:", error);
    res.status(500).send("Error sending test email.");
  }
});

module.exports = router;
