import fs from "fs";
import mysql from "mysql2/promise";

const config = {
  host: process.env.MYSQL_HOST || "127.0.0.1",
  port: Number(process.env.MYSQL_PORT || 3306),
  user: process.env.MYSQL_USER || "root",
  password: process.env.MYSQL_PASSWORD ?? "",
  database: process.env.MYSQL_DATABASE || "vts",
  waitForConnections: true,
  connectionLimit: 10,
  namedPlaceholders: true,
};

/** @type {mysql.Pool | null} */
let pool = null;

export function getPool() {
  if (!pool) throw new Error("Database not initialized. Call initDb() first.");
  return pool;
}

export async function initDb() {
  const bootstrap = await mysql.createConnection({
    host: config.host,
    port: config.port,
    user: config.user,
    password: config.password,
    multipleStatements: true,
  });

  await bootstrap.query(
    `CREATE DATABASE IF NOT EXISTS \`${config.database}\`
     CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`
  );
  await bootstrap.end();

  pool = mysql.createPool(config);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS buses (
      plate VARCHAR(20) PRIMARY KEY,
      label VARCHAR(120) NULL,
      active TINYINT(1) NOT NULL DEFAULT 1,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS positions (
      id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
      plate VARCHAR(20) NOT NULL,
      latitude DOUBLE NULL,
      longitude DOUBLE NULL,
      altitude DOUBLE NULL,
      speed DOUBLE NOT NULL DEFAULT 0,
      bearing DOUBLE NOT NULL DEFAULT 0,
      location VARCHAR(255) NULL,
      owner VARCHAR(255) NULL,
      event VARCHAR(255) NULL,
      status VARCHAR(80) NULL,
      gps_time VARCHAR(40) NULL,
      message_time VARCHAR(40) NULL,
      source VARCHAR(40) NOT NULL DEFAULT 'poll',
      recorded_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      UNIQUE KEY uq_plate_gps_source (plate, gps_time, source),
      KEY idx_positions_plate_gps (plate, gps_time),
      CONSTRAINT fk_positions_bus
        FOREIGN KEY (plate) REFERENCES buses(plate)
        ON UPDATE CASCADE ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);

  console.log(
    `[mysql] connected ${config.user}@${config.host}:${config.port}/${config.database}`
  );
  return pool;
}

export async function seedBusesFromFile(filePath) {
  if (!fs.existsSync(filePath)) return;
  const plates = fs
    .readFileSync(filePath, "utf8")
    .split(/\r?\n/)
    .map((l) => l.trim().toUpperCase())
    .filter(Boolean);

  const sql = `
    INSERT INTO buses (plate, active)
    VALUES (?, 1)
    ON DUPLICATE KEY UPDATE active = 1, updated_at = CURRENT_TIMESTAMP
  `;

  const conn = await getPool().getConnection();
  try {
    await conn.beginTransaction();
    for (const plate of plates) {
      await conn.execute(sql, [plate]);
    }
    await conn.commit();
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
}

export async function listActivePlates() {
  const [rows] = await getPool().query(
    `SELECT plate FROM buses WHERE active = 1 ORDER BY plate`
  );
  return rows.map((r) => r.plate);
}

export async function listBuses() {
  const [rows] = await getPool().query(
    `SELECT plate, label, active, created_at, updated_at
     FROM buses
     ORDER BY active DESC, plate ASC`
  );
  return rows;
}

export async function addBus(plate, label = null) {
  const normalized = String(plate || "")
    .trim()
    .toUpperCase()
    .replace(/\s+/g, "");
  if (!/^[A-Z0-9]{5,12}$/.test(normalized)) {
    throw new Error("Invalid plate. Use letters/numbers only, 5–12 chars.");
  }

  await getPool().execute(
    `INSERT INTO buses (plate, label, active)
     VALUES (?, ?, 1)
     ON DUPLICATE KEY UPDATE
       label = COALESCE(VALUES(label), label),
       active = 1,
       updated_at = CURRENT_TIMESTAMP`,
    [normalized, label || null]
  );

  return getBus(normalized);
}

export async function removeBus(plate) {
  const normalized = String(plate || "").trim().toUpperCase();
  await getPool().execute(
    `UPDATE buses SET active = 0, updated_at = CURRENT_TIMESTAMP WHERE plate = ?`,
    [normalized]
  );
  return getBus(normalized);
}

export async function getBus(plate) {
  const [rows] = await getPool().execute(
    `SELECT plate, label, active, created_at, updated_at FROM buses WHERE plate = ?`,
    [String(plate).toUpperCase()]
  );
  return rows[0] || null;
}

export async function savePositions(vehicles, source = "poll") {
  const rows = vehicles
    .filter((v) => v && v.plate && !v.offline && v.gpsTime)
    .map((v) => [
      v.plate,
      v.latitude,
      v.longitude,
      v.altitude ?? null,
      v.speed || 0,
      v.bearing || 0,
      v.location || null,
      v.owner || null,
      v.event || null,
      v.status || null,
      v.gpsTime,
      v.messageTime || null,
      source,
    ]);

  if (!rows.length) return 0;

  // Ensure parent bus rows exist so FK does not reject history imports
  const plates = [...new Set(rows.map((r) => r[0]))];
  const conn = await getPool().getConnection();
  try {
    await conn.beginTransaction();
    for (const plate of plates) {
      await conn.execute(
        `INSERT INTO buses (plate, active)
         VALUES (?, 1)
         ON DUPLICATE KEY UPDATE plate = plate`,
        [plate]
      );
    }

    const sql = `
      INSERT INTO positions (
        plate, latitude, longitude, altitude, speed, bearing,
        location, owner, event, status, gps_time, message_time, source
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON DUPLICATE KEY UPDATE
        latitude = VALUES(latitude),
        longitude = VALUES(longitude),
        altitude = VALUES(altitude),
        speed = VALUES(speed),
        bearing = VALUES(bearing),
        location = VALUES(location),
        owner = VALUES(owner),
        event = VALUES(event),
        status = VALUES(status),
        message_time = VALUES(message_time)
    `;

    for (const row of rows) {
      await conn.execute(sql, row);
    }
    await conn.commit();
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }

  return rows.length;
}

export async function queryHistory(plate, startWall, endWall) {
  const normalized = String(plate).trim().toUpperCase();
  const [rows] = await getPool().execute(
    `SELECT
       plate, latitude, longitude, altitude, speed, bearing,
       location, owner, event, status, gps_time, message_time, source, recorded_at
     FROM positions
     WHERE plate = ?
       AND gps_time IS NOT NULL
       AND STR_TO_DATE(REPLACE(LEFT(gps_time, 19), 'T', ' '), '%Y-%m-%d %H:%i:%s')
           >= STR_TO_DATE(?, '%Y-%m-%d %H:%i:%s')
       AND STR_TO_DATE(REPLACE(LEFT(gps_time, 19), 'T', ' '), '%Y-%m-%d %H:%i:%s')
           <= STR_TO_DATE(?, '%Y-%m-%d %H:%i:%s')
     ORDER BY gps_time ASC`,
    [normalized, startWall, endWall]
  );
  return rows;
}
