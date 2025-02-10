const { Pool } = require("pg");

const pool = new Pool({
  user: "postgres", // Your DB username
  host: "localhost", // If using a cloud DB, replace with host URL
  database: "neo_comm", // Your database name
  password: "your_password", // Your PostgreSQL password
  port: 5432, // Default PostgreSQL port
});

pool.connect()
  .then(() => console.log("✅ Connected to PostgreSQL"))
  .catch(err => console.error("❌ Database connection error", err));

module.exports = pool;
