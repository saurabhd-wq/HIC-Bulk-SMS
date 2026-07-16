const express = require("express");
const router = express.Router();

const {
  getConversationByContactId,
} = require("../repositories/conversationRepository");

router.get("/:contactId", async (req, res) => {
  try {
    const { contactId } = req.params;

    const messages = await getConversationByContactId(contactId);

    res.json({
      success: true,
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