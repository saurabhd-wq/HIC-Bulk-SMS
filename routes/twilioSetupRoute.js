const express = require("express");
const router = express.Router();

const {
  saveCredentials,
} = require("../repositories/twilioRepository");

router.post("/", async (req, res) => {
  try {
    const {
      hubId,
      accountSid,
      authToken,
      fromNumber,
    } = req.body;

    if (
      !hubId ||
      !accountSid ||
      !authToken ||
      !fromNumber
    ) {
      return res.status(400).json({
        success: false,
        message: "All fields are required.",
      });
    }

    const credentials = await saveCredentials({
      hubId,
      accountSid,
      authToken,
      fromNumber,
    });

    res.json({
      success: true,
      credentials,
    });
  } catch (err) {
    console.error(err);

    res.status(500).json({
      success: false,
      message: err.message,
    });
  }
});

module.exports = router;