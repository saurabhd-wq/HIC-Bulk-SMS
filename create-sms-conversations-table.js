require("dotenv").config();
const pool = require("./config/database");

async function createSmsConversationsTable() {
  const query = `
    CREATE TABLE IF NOT EXISTS sms_conversations (
      id SERIAL PRIMARY KEY,

      hubspot_contact_id BIGINT NOT NULL,

      phone_number VARCHAR(30) NOT NULL,

      twilio_message_sid VARCHAR(100),

      direction VARCHAR(20) NOT NULL,

      message TEXT NOT NULL,

      status VARCHAR(30),

      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
  `;

  try {
    await pool.query(query);
    console.log("✅ sms_conversations table created successfully.");
  } catch (error) {
    console.error("❌ Error creating sms_conversations table:", error);
  } finally {
    await pool.end();
  }
}

createSmsConversationsTable();