require("dotenv").config();

const { Pool } = require("pg");

const sourceUrl = process.env.SOURCE_DATABASE_URL || process.env.DATABASE_URL;
const targetUrl = process.env.SUPABASE_DATABASE_URL;

function createPool(connectionString) {
  const requiresSSL = connectionString.includes("supabase") || process.env.FORCE_DB_SSL === "1";
  return new Pool({
    connectionString,
    max: 2,
    connectionTimeoutMillis: 15000,
    idleTimeoutMillis: 10000,
    ssl: requiresSSL ? { rejectUnauthorized: false } : false,
  });
}

async function ensureTargetSchema(pool) {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS app_data (
      key TEXT PRIMARY KEY,
      value JSONB NOT NULL
    );
    CREATE TABLE IF NOT EXISTS app_admin (
      id TEXT PRIMARY KEY,
      hash TEXT NOT NULL,
      sel TEXT NOT NULL,
      misajourle TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS users (
      id BIGSERIAL PRIMARY KEY,
      email TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      password_salt TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE TABLE IF NOT EXISTS user_progress (
      user_id BIGINT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
      lectures JSONB NOT NULL DEFAULT '[]'::jsonb,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);
}

async function readOptional(pool, query, params = []) {
  try {
    return await pool.query(query, params);
  } catch (error) {
    if (error.code === "42P01") return { rows: [] };
    throw error;
  }
}

function quoteIdentifier(identifier) {
  return `"${String(identifier).replaceAll('"', '""')}"`;
}

async function migrate() {
  if (!sourceUrl || !targetUrl) {
    throw new Error("Definis DATABASE_URL (ancienne base) et SUPABASE_DATABASE_URL (nouvelle base). ");
  }
  if (sourceUrl === targetUrl) {
    throw new Error("Les URLs source et destination sont identiques. Migration annulee.");
  }

  const source = createPool(sourceUrl);
  const target = createPool(targetUrl);

  try {
    console.log("Connexion aux bases...");
    await source.query("SELECT 1");
    await target.query("SELECT 1");
    await ensureTargetSchema(target);

    const appData = await readOptional(source, "SELECT key, value FROM app_data");
    const admins = await readOptional(source, 'SELECT id, hash, sel, misajourle FROM app_admin');
    const users = await readOptional(source, "SELECT id, email, password_hash, password_salt, created_at, updated_at FROM users");
    const progress = await readOptional(source, "SELECT user_id, lectures, updated_at FROM user_progress");
    const targetAdminColumns = await target.query(
      "SELECT column_name FROM information_schema.columns WHERE table_schema = 'public' AND table_name = $1",
      ["app_admin"]
    );
    const targetAdminDateColumn = targetAdminColumns.rows.find((row) => row.column_name.toLowerCase() === "misajourle")?.column_name;
    if (!targetAdminDateColumn) throw new Error("La table app_admin Supabase ne contient pas la colonne misAJourLe.");

    const catalog = appData.rows.find((row) => row.key === "catalog");
    const seriesCount = Array.isArray(catalog?.value?.series) ? catalog.value.series.length : 0;
    const commentsCount = Array.isArray(catalog?.value?.commentaires) ? catalog.value.commentaires.length : 0;
    console.log(`Source: ${seriesCount} contenus, ${commentsCount} commentaires, ${users.rows.length} utilisateurs.`);

    await target.query("BEGIN");
    try {
      for (const row of appData.rows) {
        await target.query(
          `INSERT INTO app_data (key, value) VALUES ($1, $2)
           ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value`,
          [row.key, JSON.stringify(row.value)]
        );
      }
      for (const row of admins.rows) {
        await target.query(
          `INSERT INTO app_admin (id, hash, sel, ${quoteIdentifier(targetAdminDateColumn)}) VALUES ($1, $2, $3, $4)
           ON CONFLICT (id) DO UPDATE SET hash = EXCLUDED.hash, sel = EXCLUDED.sel, ${quoteIdentifier(targetAdminDateColumn)} = EXCLUDED.${quoteIdentifier(targetAdminDateColumn)}`,
          [row.id, row.hash, row.sel, row.misajourle]
        );
      }
      for (const row of users.rows) {
        await target.query(
          `INSERT INTO users (id, email, password_hash, password_salt, created_at, updated_at)
           VALUES ($1, $2, $3, $4, $5, $6)
           ON CONFLICT (id) DO UPDATE SET email = EXCLUDED.email, password_hash = EXCLUDED.password_hash,
             password_salt = EXCLUDED.password_salt, created_at = EXCLUDED.created_at, updated_at = EXCLUDED.updated_at`,
          [row.id, row.email, row.password_hash, row.password_salt, row.created_at, row.updated_at]
        );
      }
      for (const row of progress.rows) {
        await target.query(
          `INSERT INTO user_progress (user_id, lectures, updated_at) VALUES ($1, $2, $3)
           ON CONFLICT (user_id) DO UPDATE SET lectures = EXCLUDED.lectures, updated_at = EXCLUDED.updated_at`,
          [row.user_id, JSON.stringify(row.lectures), row.updated_at]
        );
      }
      await target.query("COMMIT");
    } catch (error) {
      await target.query("ROLLBACK");
      throw error;
    }

    const copied = await target.query("SELECT value FROM app_data WHERE key = $1", ["catalog"]);
    const copiedSeries = Array.isArray(copied.rows[0]?.value?.series) ? copied.rows[0].value.series.length : 0;
    if (copiedSeries !== seriesCount) {
      throw new Error(`Verification echouee: source=${seriesCount}, destination=${copiedSeries}.`);
    }
    console.log(`Migration terminee: ${copiedSeries} contenus copies vers Supabase.`);
  } finally {
    await Promise.all([source.end(), target.end()]);
  }
}

migrate().catch((error) => {
  console.error("Migration echouee:", error.message || error);
  process.exitCode = 1;
});
