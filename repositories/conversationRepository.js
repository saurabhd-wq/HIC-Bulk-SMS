const pool = require("../config/database");

async function getConversationByContactId(contactId) {
  const query = `
    SELECT
      id,
      hubspot_contact_id,
      phone_number,
      twilio_message_sid,
      direction,
      message,
      status,
      created_at
    FROM sms_conversations
    WHERE hubspot_contact_id = $1
    ORDER BY created_at ASC;
  `;

  const result = await pool.query(query, [contactId]);

  return result.rows;
}

module.exports = {
  getConversationByContactId,
};