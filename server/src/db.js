import "dotenv/config";
import pg from "pg";

const { Pool } = pg;

export const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: true },
});

pool.on("error", (error) => {
  console.error("Unexpected PostgreSQL pool error:", error);
});