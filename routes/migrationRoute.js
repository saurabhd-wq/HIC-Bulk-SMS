const express = require("express");
const router = express.Router();

const pool = require("../config/database");

router.get("/create-twilio-table", async (req, res) => {
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS twilio_credentials (
        id SERIAL PRIMARY KEY,
        hub_id BIGINT UNIQUE NOT NULL,
        account_sid TEXT NOT NULL,
        auth_token TEXT NOT NULL,
        from_number VARCHAR(30) NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

    res.json({
      success: true,
      message: "twilio_credentials table created successfully."
    });
  } catch (err) {
    console.error(err);

    res.status(500).json({
      success: false,
      message: err.message
    });
  }
});
router.get("/twilio-configs", async (req, res) => {
  try {
    const { rows } = await pool.query(
      "SELECT id, hub_id, account_sid, from_number, created_at FROM twilio_credentials"
    );

    res.json(rows);
  } catch (err) {
    res.status(500).json({
      success: false,
      message: err.message,
    });
  }
});

module.exports = router;