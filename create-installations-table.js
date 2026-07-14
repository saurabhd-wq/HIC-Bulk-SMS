require("dotenv").config();

const pool = require("./config/database");

async function createTable() {
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS hubspot_installations (
        hub_id BIGINT PRIMARY KEY,
        access_token TEXT NOT NULL,
        refresh_token TEXT NOT NULL,
        expires_at TIMESTAMP NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

    console.log("✅ hubspot_installations table created.");

    process.exit(0);
  } catch (error) {
    console.error(error);
    process.exit(1);
  }
}

createTable();