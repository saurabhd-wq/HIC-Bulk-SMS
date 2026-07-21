const pool = require("../config/database");

async function saveCredentials({
  hubId,
  accountSid,
  authToken,
  fromNumber,
}) {
  const query = `
    INSERT INTO twilio_credentials (
      hub_id,
      account_sid,
      auth_token,
      from_number
    )
    VALUES ($1,$2,$3,$4)
    ON CONFLICT (hub_id)
    DO UPDATE SET
      account_sid = EXCLUDED.account_sid,
      auth_token = EXCLUDED.auth_token,
      from_number = EXCLUDED.from_number,
      updated_at = CURRENT_TIMESTAMP
    RETURNING *;
  `;

  const { rows } = await pool.query(query, [
    hubId,
    accountSid,
    authToken,
    fromNumber,
  ]);

  return rows[0];
}

module.exports = {
  saveCredentials,
};