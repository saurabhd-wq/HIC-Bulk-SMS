require("dotenv").config();

const pool = require("./config/database");

async function createTable() {
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS sms_campaigns (
        id SERIAL PRIMARY KEY,
        hub_id BIGINT NOT NULL,
        contact_ids JSONB NOT NULL,
        message TEXT,
        status VARCHAR(20) DEFAULT 'DRAFT',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

    console.log("✅ sms_campaigns table created.");

    process.exit(0);
  } catch (error) {
    console.error(error);
    process.exit(1);
  }
}

createTable();