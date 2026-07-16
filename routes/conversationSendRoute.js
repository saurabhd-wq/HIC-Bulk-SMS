const express = require("express");
const router = express.Router();

const { sendSMS } = require("../services/twilioService");

const {
  saveOutgoingMessage,
} = require("../repositories/conversationRepository");

router.post("/", async (req, res) => {
  try {
    const {
      contactId,
      phoneNumber,
      message,
    } = req.body;

    if (!contactId || !phoneNumber || !message?.trim()) {
      return res.status(400).json({
        success: false,
        message: "contactId, phoneNumber and message are required.",
      });
    }

    const twilioResponse = await sendSMS(
      phoneNumber,
      message.trim()
    );

    const savedMessage = await saveOutgoingMessage({
      contactId,
      phoneNumber,
      twilioMessageSid: twilioResponse.sid,
      message: message.trim(),
      status: twilioResponse.status,
    });

    return res.json({
      success: true,
      message: savedMessage,
    });

  } catch (error) {
    console.error("Send Conversation SMS Error:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to send SMS.",
    });
  }
});

module.exports = router;