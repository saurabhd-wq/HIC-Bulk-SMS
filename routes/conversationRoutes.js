/**
 * conversationRoutes.js
 *
 * Only change from the original: hubId is now forwarded as the optional
 * third argument to getConversationByContactId so that the conversation
 * repository can skip the cross-portal search and use the correct OAuth token
 * directly.
 *
 * No route paths, response shapes, or business logic have changed.
 */

const express = require("express");
const router = express.Router();

const {
  getConversationByContactId,
} = require("../repositories/conversationRepository");

const {
  getContactById,
} = require("../services/hubspotService");

router.get("/:contactId", async (req, res) => {
  try {
    const { contactId } = req.params;
    const hubId = Number(req.query.hubId);
    const numberType = req.query.numberType || "phone";

    if (!hubId) {
      return res.status(400).json({
        success: false,
        message: "hubId is required.",
      });
    }

    const contact = await getContactById(hubId, contactId);
    const phoneNumber =
      numberType === "mobilePhone" ? contact.mobilePhone : contact.phone;

    // Pass hubId so the repository uses the right portal token directly.
    const messages = await getConversationByContactId(
      contactId,
      phoneNumber,
      hubId          // ← only addition vs original
    );

    res.json({
      success: true,
      contact: {
        id: contact.id,
        firstName: contact.firstName,
        lastName: contact.lastName,
        email: contact.email,
        phone: contact.phone,
        mobilePhone: contact.mobilePhone,
      },
      messages,
    });
  } catch (error) {
    console.error("Conversation API Error:", error);

    res.status(500).json({
      success: false,
      message: "Failed to load conversation.",
    });
  }
});

module.exports = router;