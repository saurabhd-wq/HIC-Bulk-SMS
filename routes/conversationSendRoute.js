const express = require("express");
const router = express.Router();

const { sendSMS } = require("../services/twilioService");
const { getContactById } = require("../services/hubspotService");

const {
  saveOutgoingMessage,
} = require("../repositories/conversationRepository");

router.post("/", async (req, res) => {
  try {
    const {
      hubId,
      contactId,
      numberType,
      message,
    } = req.body;

    if (!hubId || !contactId || !numberType || !message?.trim()) {
      return res.status(400).json({
        success: false,
        message:
          "hubId, contactId, numberType and message are required.",
      });
    }

    if (numberType !== "phone" && numberType !== "mobilePhone") {
      return res.status(400).json({
        success: false,
        message: "numberType must be either 'phone' or 'mobilePhone'.",
      });
    }

    // Fetch latest contact details from HubSpot
    const contact = await getContactById(hubId, contactId);

    if (!contact) {
      return res.status(404).json({
        success: false,
        message: "Contact not found.",
      });
    }

    // Select phone based on user's choice
    const phoneNumber =
      numberType === "mobilePhone"
        ? contact.mobilePhone
        : contact.phone;

    if (!phoneNumber) {
      return res.status(400).json({
        success: false,
        message: `Selected ${numberType} is not available for this contact.`,
      });
    }

    // Send SMS using existing Twilio service
    const twilioResponse = await sendSMS(
      phoneNumber,
      message.trim()
    );

    // Save conversation
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
    console.error("Conversation Send Error:", error);

    return res.status(500).json({
      success: false,
      message: error.message || "Failed to send SMS.",
    });
  }
});

module.exports = router;