require("dotenv").config();

const pool = require("./config/database");

async function testConnection() {
  try {
    const result = await pool.query("SELECT NOW()");

    console.log("✅ PostgreSQL Connected");
    console.log(result.rows[0]);

    process.exit(0);
  } catch (error) {
    console.error("❌ PostgreSQL Connection Failed");
    console.error(error);

    process.exit(1);
  }
}

testConnection();