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

    if (!hubId) {
      return res.status(400).json({
        success: false,
        message: "hubId is required.",
      });
    }

    const contact = await getContactById(hubId, contactId);

    const messages = await getConversationByContactId(contactId);

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