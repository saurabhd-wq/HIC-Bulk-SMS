/**
 * conversationSendRoute.js
 *
 * Only change from the original: hubId is now forwarded as a field inside
 * the object passed to saveOutgoingMessage so that the conversation
 * repository can use the correct portal OAuth token directly.
 *
 * No route paths, response shapes, or business logic have changed.
 */

const express = require("express");
const router = express.Router();

const { sendSMS } = require("../services/twilioService");
const { getContactById } = require("../services/hubspotService");
const mergeFieldService = require("../services/mergeFieldService");

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

    // Fetch latest contact details from HubSpot.
    const contact = await getContactById(hubId, contactId);

    if (!contact) {
      return res.status(404).json({
        success: false,
        message: "Contact not found.",
      });
    }

    // Select phone based on user's choice.
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

    // Resolve {{contact.x}} / {{company.x}} / {{deal.x}} / {{ticket.x}} tokens.
    const personalizedMessage = await mergeFieldService.resolveMessageForContact(
      hubId,
      message.trim(),
      contact
    );

    // Send SMS via Twilio.
    const twilioResponse = await sendSMS(
      hubId,
      phoneNumber,
      personalizedMessage
    );

    // Save conversation — hubId forwarded so the repository skips the
    // cross-portal fallback and uses the correct token directly.
    const savedMessage = await saveOutgoingMessage({
      contactId,
      phoneNumber,
      twilioMessageSid: twilioResponse.sid,
      message: personalizedMessage,
      status: twilioResponse.status,
      hubId,           // ← only addition vs original
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