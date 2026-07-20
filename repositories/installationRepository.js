const pool = require("../config/database");

async function saveInstallation({
  hubId,
  accessToken,
  refreshToken,
  expiresAt,
}) {
  await pool.query(
    `
      INSERT INTO hubspot_installations (
        hub_id,
        access_token,
        refresh_token,
        expires_at
      )
      VALUES ($1, $2, $3, $4)
      ON CONFLICT (hub_id)
      DO UPDATE SET
        access_token = EXCLUDED.access_token,
        refresh_token = EXCLUDED.refresh_token,
        expires_at = EXCLUDED.expires_at,
        updated_at = CURRENT_TIMESTAMP;
    `,
    [
      hubId,
      accessToken,
      refreshToken,
      expiresAt,
    ]
  );
}

async function getInstallation(hubId) {
  console.log("Looking for Hub ID:", hubId);

  const result = await pool.query(
    `
      SELECT *
      FROM hubspot_installations
      WHERE hub_id = $1
    `,
    [hubId]
  );

  console.log("Installation:", result.rows);

  return result.rows[0] || null;
}

async function getAllInstallations() {
  const result = await pool.query(`
    SELECT
      hub_id,
      access_token,
      refresh_token,
      expires_at
    FROM hubspot_installations
  `);

  return result.rows;
}

module.exports = {
  saveInstallation,
  getInstallation,
  getAllInstallations,
};