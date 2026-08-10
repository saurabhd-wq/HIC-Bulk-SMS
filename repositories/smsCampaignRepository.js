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
    [hubId, JSON.stringify(contactIds)]
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
  const result = await pool.query(
    `
    UPDATE sms_campaigns
    SET
      message = $2,
      updated_at = CURRENT_TIMESTAMP
    WHERE id = $1
    RETURNING *;
    `,
    [id, message]
  );

  return result.rows[0];
}

// ---- NEW: scheduling support ----

async function scheduleCampaign(id, message, scheduledAt, timezone) {
  const result = await pool.query(
    `
    UPDATE sms_campaigns
    SET
      message = $2,
      scheduled_at = $3,
      timezone = $4,
      status = 'SCHEDULED',
      updated_at = CURRENT_TIMESTAMP
    WHERE id = $1
    RETURNING *;
    `,
    [id, message, scheduledAt, timezone]
  );

  return result.rows[0];
}

async function getDueScheduledCampaigns() {
  const result = await pool.query(
    `
    SELECT *
    FROM sms_campaigns
    WHERE status = 'SCHEDULED'
      AND scheduled_at <= CURRENT_TIMESTAMP
    ORDER BY scheduled_at ASC;
    `
  );

  return result.rows;
}

async function markCampaignSent(id) {
  const result = await pool.query(
    `
    UPDATE sms_campaigns
    SET status = 'SENT', updated_at = CURRENT_TIMESTAMP
    WHERE id = $1
    RETURNING *;
    `,
    [id]
  );

  return result.rows[0];
}

async function markCampaignFailed(id) {
  const result = await pool.query(
    `
    UPDATE sms_campaigns
    SET status = 'FAILED', updated_at = CURRENT_TIMESTAMP
    WHERE id = $1
    RETURNING *;
    `,
    [id]
  );

  return result.rows[0];
}

async function getCampaignsByStatus(hubId, status) {
  const result = await pool.query(
    `
    SELECT *
    FROM sms_campaigns
    WHERE hub_id = $1
      AND status = $2
    ORDER BY
      CASE WHEN status = 'SCHEDULED' THEN scheduled_at ELSE updated_at END DESC,
      id DESC;
    `,
    [hubId, status]
  );

  return result.rows;
}

async function updateScheduledCampaign(id, message, scheduledAt, timezone) {
  const result = await pool.query(
    `
    UPDATE sms_campaigns
    SET
      message = $2,
      scheduled_at = $3,
      timezone = $4,
      updated_at = CURRENT_TIMESTAMP
    WHERE id = $1
      AND status = 'SCHEDULED'
    RETURNING *;
    `,
    [id, message, scheduledAt, timezone]
  );

  return result.rows[0] || null;
}

async function deleteScheduledCampaign(id) {
  const result = await pool.query(
    `
    DELETE FROM sms_campaigns
    WHERE id = $1
      AND status = 'SCHEDULED'
    RETURNING *;
    `,
    [id]
  );

  return result.rows[0] || null;
}

module.exports = {
  createCampaign,
  getCampaign,
  updateMessage,
  scheduleCampaign,
  getDueScheduledCampaigns,
  markCampaignSent,
  markCampaignFailed,
  getCampaignsByStatus,
  updateScheduledCampaign,
  deleteScheduledCampaign,
};