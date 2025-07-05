import * as dotenv from 'dotenv';
dotenv.config();
import { createPool } from 'mysql2/promise';
const pool = createPool({
  host: process.env.DB_HOST || "localhost",
  user: process.env.DB_USER || "root",
  password: process.env.DB_PASSWORD || "",
  database: process.env.DB_NAME || "inventory_system",
  port: parseInt(process.env.DB_PORT || "3306"),
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
});



export default pool;
