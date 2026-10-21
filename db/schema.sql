-- Cloudflare D1 schema（SQLite）—— OE 官网
-- 替换腾讯云 CloudBase PG：前台读 + 后台写所需的最小结构。

DROP TABLE IF EXISTS api_tokens;
DROP TABLE IF EXISTS admin_sessions;
DROP TABLE IF EXISTS admins;
DROP TABLE IF EXISTS private_config;
DROP TABLE IF EXISTS site_settings;
DROP TABLE IF EXISTS products;
DROP TABLE IF EXISTS categories;

CREATE TABLE categories (
  id          INTEGER PRIMARY KEY,
  slug        TEXT    NOT NULL UNIQUE,
  name_en     TEXT    NOT NULL DEFAULT '',
  name_zh     TEXT,
  group_key   TEXT    NOT NULL DEFAULT 'apparel',
  sort_order  INTEGER NOT NULL DEFAULT 0,
  is_visible  INTEGER NOT NULL DEFAULT 1,
  parent_id   INTEGER REFERENCES categories(id) ON DELETE SET NULL
);
CREATE INDEX idx_categories_parent ON categories(parent_id, sort_order);

CREATE TABLE products (
  id          INTEGER PRIMARY KEY,
  category_id INTEGER NOT NULL REFERENCES categories(id),
  name_en     TEXT    NOT NULL DEFAULT '',
  name_zh     TEXT,
  images      TEXT    NOT NULL DEFAULT '[]',   -- JSON array
  links       TEXT    NOT NULL DEFAULT '{}',   -- JSON object
  sort_order  INTEGER NOT NULL DEFAULT 0,
  is_visible  INTEGER NOT NULL DEFAULT 1,
  clicks      INTEGER NOT NULL DEFAULT 0,
  sold_count  INTEGER NOT NULL DEFAULT 0,
  created_at  TEXT    NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_products_cat  ON products(category_id, sort_order, id);
CREATE INDEX idx_products_sort ON products(is_visible, sort_order, id);

CREATE TABLE site_settings (
  id          INTEGER PRIMARY KEY DEFAULT 1,
  data        TEXT NOT NULL DEFAULT '{}',
  updated_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE private_config (
  id          INTEGER PRIMARY KEY DEFAULT 1,
  data        TEXT NOT NULL DEFAULT '{}',
  updated_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE admins (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  username      TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  display_name  TEXT,
  last_login_at TEXT,
  created_at    TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE admin_sessions (
  token      TEXT PRIMARY KEY,          -- SHA-256(token)
  admin_id   INTEGER NOT NULL REFERENCES admins(id) ON DELETE CASCADE,
  expires_at TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE api_tokens (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  label        TEXT NOT NULL DEFAULT '',
  token_hash   TEXT NOT NULL,
  token_hint   TEXT,
  token_plain  TEXT,
  created_at   TEXT NOT NULL DEFAULT (datetime('now')),
  last_used_at TEXT,
  use_count    INTEGER NOT NULL DEFAULT 0,
  revoked      INTEGER NOT NULL DEFAULT 0
);
