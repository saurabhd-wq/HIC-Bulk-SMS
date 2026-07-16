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
async function saveOutgoingMessage({
  contactId,
  phoneNumber,
  twilioMessageSid,
  message,
  status,
}) {
  const result = await pool.query(
    `
    INSERT INTO sms_conversations (
      hubspot_contact_id,
      phone_number,
      twilio_message_sid,
      direction,
      message,
      status
    )
    VALUES ($1, $2, $3, 'outbound', $4, $5)
    RETURNING *;
    `,
    [
      contactId,
      phoneNumber,
      twilioMessageSid,
      message,
      status,
    ]
  );

  return result.rows[0];
}
module.exports = {
  getConversationByContactId,
  saveOutgoingMessage,
};