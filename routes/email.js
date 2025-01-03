const express = require("express");
const router = express.Router();
const sendEmail = require("../utils/sendEmail"); // Import the sendEmail utility

// Route to send a reservation confirmation email
router.post("/send-reservation-email", async (req, res) => {
  const { email, reservationDetails } = req.body;

  if (!email || !reservationDetails) {
    return res.status(400).send("Email and reservation details are required.");
  }

  try {
    const subject = "Reservation Submitted: Awaiting Approval";
    const text = `Dear User,

Your reservation for ${reservationDetails.room} on ${reservationDetails.date} has been successfully submitted. 
It is currently awaiting approval.

Thank you for using our service.

Best regards,
The Reservations Team`;

    const html = `
      <p>Dear User,</p>
      <p>Your reservation for <strong>${reservationDetails.room}</strong> on <strong>${reservationDetails.date}</strong> has been successfully submitted. It is currently awaiting approval.</p>
      <p>Thank you for using our service.</p>
      <p>Best regards,<br>The Reservations Team</p>
    `;

    // Send the email
    await sendEmail(email, subject, text, html);

    res.status(200).send("Reservation email sent successfully.");
  } catch (error) {
    console.error("Error sending reservation email:", error);
    res.status(500).send("Failed to send reservation email.");
  }
});

module.exports = router;
