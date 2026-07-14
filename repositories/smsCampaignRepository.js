const pool = require("../config/database");

async function createCampaign(hubId, contactIds) {
  const result = await pool.query(
    `
      INSERT INTO sms_campaigns (
        hub_id,
        contact_ids
      )
      VALUES ($1, $2)
      RETURNING *;
    `,
    [
      hubId,
      JSON.stringify(contactIds),
    ]
  );

  return result.rows[0];
}

async function getCampaign(id) {
  const result = await pool.query(
    `
      SELECT *
      FROM sms_campaigns
      WHERE id = $1
    `,
    [id]
  );

  return result.rows[0] || null;
}

async function updateMessage(id, message) {
  await pool.query(
    `
      UPDATE sms_campaigns
      SET
        message = $2,
        updated_at = CURRENT_TIMESTAMP
      WHERE id = $1
    `,
    [id, message]
  );
}

module.exports = {
  createCampaign,
  getCampaign,
  updateMessage,
};