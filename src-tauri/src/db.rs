use crate::config;
use crate::models::FilamentInfo;
use chrono::Utc;
use rusqlite::{Connection, Result};
use std::collections::HashSet;
use std::fs;
use std::path::PathBuf;
use std::sync::Mutex;
use uuid::Uuid;

const DEFAULT_FILAMENTS_JSON: &str = include_str!("../resources/default_filaments.json");

/// Lightweight struct for in-memory filament matching (avoids repeated DB queries).
#[allow(dead_code)]
pub(crate) struct CuratedFilamentRow {
    id: String,
    brand: String,
    line: String,
    name: String,
    material: String,
    color: String,
    // Pre-computed lowercase fields to avoid repeated .to_lowercase() in matching loops
    brand_lower: String,
    line_lower: String,
    name_lower: String,
    full_brand_lower: String,   // "{brand} {line}" lowercased
    brand_norm: String,          // brand+line lowered, no spaces/hyphens
}

pub struct Database {
    conn: Mutex<Option<Connection>>,
}

impl Database {
    pub fn new() -> Self {
        let conn = if config::is_first_launch() {
            None
        } else {
            Some(Self::open_connection())
        };
        Self {
            conn: Mutex::new(conn),
        }
    }

    fn open_connection() -> Connection {
        let db_path = Self::db_path();
        if let Some(parent) = db_path.parent() {
            fs::create_dir_all(parent).expect("Failed to create data directory");
        }
        let conn = Connection::open(&db_path).expect("Failed to open database");
        conn.execute_batch("PRAGMA journal_mode=WAL;").expect("WAL mode");
        conn.execute_batch("PRAGMA foreign_keys=ON;").expect("foreign keys");

        // Attach shared filaments database
        let shared_path = Self::shared_filaments_db_path();
        if let Some(parent) = shared_path.parent() {
            fs::create_dir_all(parent).expect("Failed to create config directory");
        }
        conn.execute(
            &format!("ATTACH DATABASE '{}' AS shared", shared_path.to_string_lossy().replace('\'', "''")),
            [],
        ).expect("Failed to attach shared filaments database");
        conn.execute_batch("PRAGMA shared.journal_mode=WAL;").expect("shared WAL mode");
        Self::run_shared_migrations(&conn).expect("shared migrations");
        Self::seed_default_filaments(&conn);

        Self::run_migrations_on(&conn).expect("migrations");
        conn
    }

    /// Path to the shared filaments database (in config dir, not per-library)
    fn shared_filaments_db_path() -> PathBuf {
        config::config_dir_path().join("filaments.sqlite")
    }

    /// Create curated_filaments table in the shared database
    fn run_shared_migrations(conn: &Connection) -> Result<()> {
        conn.execute_batch(
            "
            CREATE TABLE IF NOT EXISTS shared.curated_filaments (
                id TEXT PRIMARY KEY,
                brand TEXT NOT NULL DEFAULT '',
                line TEXT NOT NULL DEFAULT '',
                material TEXT NOT NULL DEFAULT 'PLA',
                name TEXT NOT NULL,
                color TEXT NOT NULL DEFAULT '',
                transmission_distance REAL,
                owned INTEGER NOT NULL DEFAULT 0,
                source_uuid TEXT,
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL
            );
            CREATE UNIQUE INDEX IF NOT EXISTS shared.idx_curated_brand_line_name
                ON curated_filaments(LOWER(brand), LOWER(line), LOWER(name));
            "
        )?;
        Ok(())
    }

    /// Seed the shared filaments database with defaults if empty
    pub(crate) fn seed_default_filaments(conn: &Connection) {
        let count: i64 = conn
            .query_row("SELECT COUNT(*) FROM shared.curated_filaments", [], |r| r.get(0))
            .unwrap_or(0);
        if count > 0 {
            return;
        }

        let json: serde_json::Value = match serde_json::from_str(DEFAULT_FILAMENTS_JSON) {
            Ok(v) => v,
            Err(e) => {
                eprintln!("Failed to parse default filaments JSON: {}", e);
                return;
            }
        };

        let arr = match json.as_array()
            .or_else(|| json.get("Filaments").and_then(|v| v.as_array()))
        {
            Some(a) => a,
            None => {
                eprintln!("Default filaments JSON has unexpected format");
                return;
            }
        };

        let now = Utc::now().to_rfc3339();
        let mut count = 0;
        conn.execute_batch("BEGIN").ok();
        for item in arr {
            let material = item.get("Type").and_then(|v| v.as_str())
                .or_else(|| item.get("Material").and_then(|v| v.as_str()))
                .unwrap_or("PLA");
            if material.eq_ignore_ascii_case("IMAGE") { continue; }

            let brand_raw = item.get("Brand").and_then(|v| v.as_str()).unwrap_or("");
            let name = item.get("Name").and_then(|v| v.as_str()).unwrap_or("");
            let color = item.get("Color").and_then(|v| v.as_str()).unwrap_or("");
            let td = item.get("Transmissivity").and_then(|v| v.as_f64())
                .or_else(|| item.get("TD").and_then(|v| v.as_f64()))
                .or_else(|| item.get("Transmission Distance").and_then(|v| v.as_f64()));
            let uuid_str = item.get("uuid").and_then(|v| v.as_str())
                .or_else(|| item.get("UUID").and_then(|v| v.as_str()));

            if name.is_empty() { continue; }

            let owned = item.get("Owned").and_then(|v| v.as_bool()).unwrap_or(false);
            let (brand, line) = Self::split_brand_line(brand_raw);
            let id = Uuid::new_v4().to_string();

            if conn.execute(
                "INSERT OR IGNORE INTO shared.curated_filaments (id, brand, line, material, name, color, transmission_distance, owned, source_uuid, created_at, updated_at)
                 VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11)",
                rusqlite::params![id, brand, line, material, name, color, td, owned, uuid_str, now, now],
            ).is_ok() {
                count += 1;
            }
        }
        conn.execute_batch("COMMIT").ok();
        eprintln!("Seeded {} default filaments", count);
    }

    /// Close the database connection, releasing file locks.
    pub fn close(&self) {
        let mut guard = self.conn.lock().expect("Failed to lock database");
        *guard = None;
    }

    /// Close the current connection and open a new one for the active library.
    /// Call this after switching the active library in config.
    pub fn reconnect(&self) {
        let mut guard = self.conn.lock().expect("Failed to lock database");
        *guard = Some(Self::open_connection());
    }

    /// Lock the database and return the guard. Lazily initializes on first use.
    /// Callers use: `let conn = db.conn(); let conn = conn.as_ref().unwrap();`
    pub fn conn(&self) -> std::sync::MutexGuard<'_, Option<Connection>> {
        let mut guard = self.conn.lock().expect("Failed to lock database");
        if guard.is_none() {
            *guard = Some(Self::open_connection());
        }
        guard
    }

    pub fn data_dir() -> PathBuf {
        config::library_path()
    }

    fn db_path() -> PathBuf {
        Self::data_dir().join("db.sqlite")
    }

    fn run_migrations_on(conn: &Connection) -> Result<()> {
        conn.execute_batch(
            "
            CREATE TABLE IF NOT EXISTS projects (
                id TEXT PRIMARY KEY,
                name TEXT NOT NULL,
                description TEXT NOT NULL DEFAULT '',
                creator TEXT NOT NULL DEFAULT 'Me',
                thumbnail_path TEXT,
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL
            );

            CREATE TABLE IF NOT EXISTS tags (
                id TEXT PRIMARY KEY,
                name TEXT NOT NULL UNIQUE,
                color TEXT NOT NULL DEFAULT '#6366f1'
            );

            CREATE TABLE IF NOT EXISTS collections (
                id TEXT PRIMARY KEY,
                name TEXT NOT NULL,
                description TEXT NOT NULL DEFAULT '',
                cover_image_path TEXT,
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL
            );

            CREATE TABLE IF NOT EXISTS project_tags (
                project_id TEXT NOT NULL,
                tag_id TEXT NOT NULL,
                PRIMARY KEY (project_id, tag_id),
                FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
                FOREIGN KEY (tag_id) REFERENCES tags(id) ON DELETE CASCADE
            );

            CREATE TABLE IF NOT EXISTS project_collections (
                project_id TEXT NOT NULL,
                collection_id TEXT NOT NULL,
                PRIMARY KEY (project_id, collection_id),
                FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
                FOREIGN KEY (collection_id) REFERENCES collections(id) ON DELETE CASCADE
            );

            CREATE TABLE IF NOT EXISTS assets (
                id TEXT PRIMARY KEY,
                project_id TEXT NOT NULL,
                asset_type TEXT NOT NULL CHECK(asset_type IN ('design', 'hueforge', 'bambulab')),
                created_at TEXT NOT NULL,
                FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
            );

            CREATE TABLE IF NOT EXISTS revisions (
                id TEXT PRIMARY KEY,
                asset_id TEXT NOT NULL,
                version_number INTEGER NOT NULL,
                file_path TEXT NOT NULL,
                original_filename TEXT NOT NULL,
                notes TEXT NOT NULL DEFAULT '',
                thumbnail_path TEXT,
                created_at TEXT NOT NULL,
                FOREIGN KEY (asset_id) REFERENCES assets(id) ON DELETE CASCADE,
                UNIQUE(asset_id, version_number)
            );

            CREATE TABLE IF NOT EXISTS files (
                id TEXT PRIMARY KEY,
                project_id TEXT NOT NULL,
                file_path TEXT NOT NULL,
                original_filename TEXT NOT NULL,
                file_size INTEGER NOT NULL DEFAULT 0,
                notes TEXT NOT NULL DEFAULT '',
                thumbnail_path TEXT,
                created_at TEXT NOT NULL,
                FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
            );

            CREATE VIRTUAL TABLE IF NOT EXISTS projects_fts USING fts5(
                name,
                description,
                content='projects',
                content_rowid='rowid'
            );

            CREATE TRIGGER IF NOT EXISTS projects_ai AFTER INSERT ON projects BEGIN
                INSERT INTO projects_fts(rowid, name, description) VALUES (new.rowid, new.name, new.description);
            END;

            CREATE TRIGGER IF NOT EXISTS projects_ad AFTER DELETE ON projects BEGIN
                INSERT INTO projects_fts(projects_fts, rowid, name, description) VALUES('delete', old.rowid, old.name, old.description);
            END;

            CREATE TRIGGER IF NOT EXISTS projects_au AFTER UPDATE ON projects BEGIN
                INSERT INTO projects_fts(projects_fts, rowid, name, description) VALUES('delete', old.rowid, old.name, old.description);
                INSERT INTO projects_fts(rowid, name, description) VALUES (new.rowid, new.name, new.description);
            END;
            ",
        )?;

        // Migration: add creator column to projects
        let has_creator: bool = conn.query_row(
            "SELECT COUNT(*) FROM pragma_table_info('projects') WHERE name = 'creator'",
            [],
            |row| row.get::<_, i64>(0),
        ).unwrap_or(0) > 0;

        if !has_creator {
            conn.execute_batch(
                "ALTER TABLE projects ADD COLUMN creator TEXT NOT NULL DEFAULT 'Me';"
            )?;
        }

        // Migration: rename 'affinity' asset_type to 'design'
        let has_affinity: bool = conn.query_row(
            "SELECT EXISTS(SELECT 1 FROM assets WHERE asset_type = 'affinity')",
            [],
            |row| row.get(0),
        ).unwrap_or(false);

        if has_affinity {
            conn.execute_batch(
                "
                CREATE TABLE assets_new (
                    id TEXT PRIMARY KEY,
                    project_id TEXT NOT NULL,
                    asset_type TEXT NOT NULL CHECK(asset_type IN ('design', 'hueforge', 'bambulab')),
                    created_at TEXT NOT NULL,
                    FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
                );
                INSERT INTO assets_new SELECT id, project_id,
                    CASE WHEN asset_type = 'affinity' THEN 'design' ELSE asset_type END,
                    created_at FROM assets;
                DROP TABLE assets;
                ALTER TABLE assets_new RENAME TO assets;
                "
            )?;
        }

        // Migration: migrate revisions to files table
        let has_files_table: bool = conn.query_row(
            "SELECT COUNT(*) FROM sqlite_master WHERE type='table' AND name='files'",
            [],
            |row| row.get::<_, i64>(0),
        ).unwrap_or(0) > 0;

        if has_files_table {
            let needs_migration: bool = conn.query_row(
                "SELECT EXISTS(SELECT 1 FROM revisions) AND NOT EXISTS(SELECT 1 FROM files)",
                [],
                |row| row.get(0),
            ).unwrap_or(false);

            if needs_migration {
                conn.execute_batch(
                    "INSERT INTO files (id, project_id, file_path, original_filename, file_size, notes, thumbnail_path, created_at)
                     SELECT r.id, a.project_id, r.file_path, r.original_filename, 0, r.notes, r.thumbnail_path, r.created_at
                     FROM revisions r JOIN assets a ON r.asset_id = a.id;"
                )?;
            }
        }

        // Migration: add metadata column to files
        let has_metadata: bool = conn.query_row(
            "SELECT COUNT(*) FROM pragma_table_info('files') WHERE name = 'metadata'",
            [],
            |row| row.get::<_, i64>(0),
        ).unwrap_or(0) > 0;

        if !has_metadata {
            conn.execute_batch(
                "ALTER TABLE files ADD COLUMN metadata TEXT NOT NULL DEFAULT '{}';"
            )?;
        }

        // Migration: add favorited column to files
        let has_favorited: bool = conn.query_row(
            "SELECT COUNT(*) FROM pragma_table_info('files') WHERE name = 'favorited'",
            [],
            |row| row.get::<_, i64>(0),
        ).unwrap_or(0) > 0;

        if !has_favorited {
            conn.execute_batch(
                "ALTER TABLE files ADD COLUMN favorited INTEGER NOT NULL DEFAULT 0;"
            )?;
        }

        // Migration: add modified_at column to files
        let has_modified_at: bool = conn.query_row(
            "SELECT COUNT(*) FROM pragma_table_info('files') WHERE name = 'modified_at'",
            [],
            |row| row.get::<_, i64>(0),
        ).unwrap_or(0) > 0;

        if !has_modified_at {
            conn.execute_batch(
                "ALTER TABLE files ADD COLUMN modified_at TEXT NOT NULL DEFAULT '';"
            )?;
            // Backfill from created_at for existing rows
            conn.execute_batch(
                "UPDATE files SET modified_at = created_at WHERE modified_at = '';"
            )?;
        }

        // Migration: rename affinity directories to design
        let projects_dir = Self::data_dir().join("projects");
        if projects_dir.exists() {
            if let Ok(entries) = fs::read_dir(&projects_dir) {
                for entry in entries.flatten() {
                    let old_path = entry.path().join("affinity");
                    let new_path = entry.path().join("design");
                    if old_path.exists() && !new_path.exists() {
                        let _ = fs::rename(&old_path, &new_path);
                    }
                }
            }
        }

        // Migration: create project_filaments table (curated_filaments now lives in shared DB)
        let has_project_filaments: bool = conn.query_row(
            "SELECT COUNT(*) FROM sqlite_master WHERE type='table' AND name='project_filaments'",
            [],
            |row| row.get::<_, i64>(0),
        ).unwrap_or(0) > 0;

        if !has_project_filaments {
            conn.execute_batch(
                "
                CREATE TABLE IF NOT EXISTS project_filaments (
                    id TEXT PRIMARY KEY,
                    project_id TEXT NOT NULL,
                    file_id TEXT NOT NULL,
                    curated_filament_id TEXT,
                    parsed_color TEXT NOT NULL DEFAULT '',
                    parsed_brand TEXT NOT NULL DEFAULT '',
                    parsed_name TEXT NOT NULL DEFAULT '',
                    parsed_td REAL,
                    match_status TEXT NOT NULL DEFAULT 'unmatched'
                        CHECK(match_status IN ('exact', 'guessed', 'unmatched', 'confirmed')),
                    FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
                    FOREIGN KEY (file_id) REFERENCES files(id) ON DELETE CASCADE
                );
                "
            )?;

            // Data migration: extract filaments from existing file metadata into shared.curated_filaments
            Self::migrate_filaments_to_curated(conn)?;
        }

        // Migration: move local curated_filaments to shared DB and rebuild
        // project_filaments without FK to local curated_filaments.
        // Must run with foreign_keys=OFF to avoid errors on missing table references.
        let has_local_curated: bool = conn.query_row(
            "SELECT COUNT(*) FROM sqlite_master WHERE type='table' AND name='curated_filaments'",
            [],
            |row| row.get::<_, i64>(0),
        ).unwrap_or(0) > 0;

        // Check if project_filaments still has FK to curated_filaments (old schema)
        let pf_sql: String = conn.query_row(
            "SELECT sql FROM sqlite_master WHERE type='table' AND name='project_filaments'",
            [],
            |row| row.get(0),
        ).unwrap_or_default();
        let needs_pf_rebuild = pf_sql.contains("REFERENCES curated_filaments");

        if has_local_curated || needs_pf_rebuild {
            conn.execute_batch("PRAGMA foreign_keys=OFF;")?;

            if has_local_curated {
                let shared_count: i64 = conn.query_row(
                    "SELECT COUNT(*) FROM shared.curated_filaments",
                    [],
                    |row| row.get(0),
                ).unwrap_or(0);

                if shared_count == 0 {
                    conn.execute_batch(
                        "INSERT OR IGNORE INTO shared.curated_filaments
                         SELECT * FROM main.curated_filaments"
                    )?;
                }

                conn.execute_batch("DROP TABLE IF EXISTS main.curated_filaments")?;
            }

            // Rebuild project_filaments without FK to curated_filaments
            if needs_pf_rebuild {
                conn.execute_batch(
                    "
                    CREATE TABLE IF NOT EXISTS project_filaments_new (
                        id TEXT PRIMARY KEY,
                        project_id TEXT NOT NULL,
                        file_id TEXT NOT NULL,
                        curated_filament_id TEXT,
                        parsed_color TEXT NOT NULL DEFAULT '',
                        parsed_brand TEXT NOT NULL DEFAULT '',
                        parsed_name TEXT NOT NULL DEFAULT '',
                        parsed_td REAL,
                        match_status TEXT NOT NULL DEFAULT 'unmatched'
                            CHECK(match_status IN ('exact', 'guessed', 'unmatched', 'confirmed')),
                        is_manual INTEGER NOT NULL DEFAULT 0,
                        FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
                        FOREIGN KEY (file_id) REFERENCES files(id) ON DELETE CASCADE
                    );
                    INSERT OR IGNORE INTO project_filaments_new
                        SELECT id, project_id, file_id, curated_filament_id, parsed_color, parsed_brand, parsed_name, parsed_td, match_status,
                               COALESCE(is_manual, 0) FROM project_filaments;
                    DROP TABLE project_filaments;
                    ALTER TABLE project_filaments_new RENAME TO project_filaments;
                    "
                )?;
            }

            conn.execute_batch("PRAGMA foreign_keys=ON;")?;
        }

        // If project_filaments have lost their curated_filament_id (e.g. from a prior
        // migration that cascaded), re-run matching to restore references
        let orphaned: i64 = conn.query_row(
            "SELECT COUNT(*) FROM project_filaments WHERE curated_filament_id IS NULL AND match_status != 'unmatched'",
            [],
            |row| row.get(0),
        ).unwrap_or(0);
        if orphaned > 0 {
            conn.execute(
                "UPDATE project_filaments SET curated_filament_id = NULL, match_status = 'unmatched' WHERE curated_filament_id IS NULL AND match_status != 'unmatched'",
                [],
            )?;
            Self::run_matching_all(conn)?;
        }

        // Migration: add is_manual column to project_filaments (for tables not yet rebuilt)
        let has_is_manual = conn.prepare("SELECT is_manual FROM project_filaments LIMIT 0").is_ok();
        if !has_is_manual {
            conn.execute("ALTER TABLE project_filaments ADD COLUMN is_manual INTEGER NOT NULL DEFAULT 0", []).ok();
        }

        // Migration: add print info columns to projects
        let has_print_width = conn.prepare("SELECT print_width_mm FROM projects LIMIT 0").is_ok();
        if !has_print_width {
            conn.execute("ALTER TABLE projects ADD COLUMN print_width_mm REAL", []).ok();
            conn.execute("ALTER TABLE projects ADD COLUMN print_height_mm REAL", []).ok();
            conn.execute("ALTER TABLE projects ADD COLUMN print_time_mins INTEGER", []).ok();
        }

        // Migration: make file_id nullable for manual project_filaments
        let pf_has_notnull_file_id: bool = conn.query_row(
            "SELECT sql FROM sqlite_master WHERE type='table' AND name='project_filaments'",
            [],
            |row| row.get::<_, String>(0),
        ).map(|sql| sql.contains("file_id TEXT NOT NULL")).unwrap_or(false);

        if pf_has_notnull_file_id {
            conn.execute_batch("PRAGMA foreign_keys=OFF;")?;
            conn.execute_batch(
                "
                CREATE TABLE project_filaments_v2 (
                    id TEXT PRIMARY KEY,
                    project_id TEXT NOT NULL,
                    file_id TEXT,
                    curated_filament_id TEXT,
                    parsed_color TEXT NOT NULL DEFAULT '',
                    parsed_brand TEXT NOT NULL DEFAULT '',
                    parsed_name TEXT NOT NULL DEFAULT '',
                    parsed_td REAL,
                    match_status TEXT NOT NULL DEFAULT 'unmatched'
                        CHECK(match_status IN ('exact', 'guessed', 'unmatched', 'confirmed')),
                    is_manual INTEGER NOT NULL DEFAULT 0,
                    FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
                    FOREIGN KEY (file_id) REFERENCES files(id) ON DELETE CASCADE
                );
                INSERT INTO project_filaments_v2
                    SELECT id, project_id, NULLIF(file_id, ''), curated_filament_id, parsed_color, parsed_brand, parsed_name, parsed_td, match_status,
                           COALESCE(is_manual, 0) FROM project_filaments;
                DROP TABLE project_filaments;
                ALTER TABLE project_filaments_v2 RENAME TO project_filaments;
                "
            )?;
            conn.execute_batch("PRAGMA foreign_keys=ON;")?;
        }

        // Migration: add is_template column to projects
        let has_is_template = conn.prepare("SELECT is_template FROM projects LIMIT 0").is_ok();
        if !has_is_template {
            conn.execute("ALTER TABLE projects ADD COLUMN is_template INTEGER NOT NULL DEFAULT 0", []).ok();
        }

        // Performance indexes
        conn.execute_batch(
            "
            CREATE INDEX IF NOT EXISTS idx_projects_updated_at ON projects(updated_at);
            CREATE INDEX IF NOT EXISTS idx_projects_created_at ON projects(created_at);
            CREATE INDEX IF NOT EXISTS idx_projects_name ON projects(name);
            CREATE INDEX IF NOT EXISTS idx_files_project_id ON files(project_id);
            CREATE INDEX IF NOT EXISTS idx_files_favorited ON files(favorited);
            CREATE INDEX IF NOT EXISTS idx_project_filaments_project_id ON project_filaments(project_id);
            CREATE INDEX IF NOT EXISTS idx_project_filaments_curated ON project_filaments(curated_filament_id);
            CREATE INDEX IF NOT EXISTS idx_project_tags_project_id ON project_tags(project_id);
            CREATE INDEX IF NOT EXISTS idx_project_tags_tag_id ON project_tags(tag_id);
            CREATE INDEX IF NOT EXISTS idx_project_collections_project_id ON project_collections(project_id);
            CREATE INDEX IF NOT EXISTS idx_project_collections_collection_id ON project_collections(collection_id);
            "
        )?;

        Ok(())
    }

    /// Split compound brand like "BambuLab Basic" into (brand, line).
    /// Known patterns: "BambuLab Basic", "BambuLab Matte", "Polymaker PolyTerra", etc.
    pub fn split_brand_line(compound_brand: &str) -> (String, String) {
        let parts: Vec<&str> = compound_brand.split_whitespace().collect();
        if parts.len() >= 2 {
            (parts[0].to_string(), parts[1..].join(" "))
        } else {
            (compound_brand.to_string(), String::new())
        }
    }

    fn migrate_filaments_to_curated(conn: &Connection) -> Result<()> {
        let now = chrono::Utc::now().to_rfc3339();

        // Extract unique filaments from file metadata
        let mut stmt = conn.prepare(
            "SELECT DISTINCT
                json_extract(je.value, '$.color') as color,
                json_extract(je.value, '$.name') as name,
                json_extract(je.value, '$.brand') as brand
            FROM files f, json_each(json_extract(f.metadata, '$.filaments')) AS je
            WHERE f.favorited = 1
              AND json_extract(f.metadata, '$.filaments') IS NOT NULL"
        )?;

        let filaments: Vec<FilamentInfo> = stmt.query_map([], |row| {
            Ok(FilamentInfo {
                color: row.get::<_, String>(0).unwrap_or_default(),
                name: row.get::<_, String>(1).unwrap_or_default(),
                brand: row.get::<_, String>(2).unwrap_or_default(),
            })
        })?.filter_map(|r| r.ok()).collect();

        let mut seen = HashSet::new();

        for f in &filaments {
            let (brand, line) = Self::split_brand_line(&f.brand);
            let dedup_key = format!("{}|{}|{}", brand.to_lowercase(), line.to_lowercase(), f.name.to_lowercase());
            if seen.contains(&dedup_key) { continue; }
            seen.insert(dedup_key);

            let id = Uuid::new_v4().to_string();
            conn.execute(
                "INSERT OR IGNORE INTO shared.curated_filaments (id, brand, line, material, name, color, created_at, updated_at)
                 VALUES (?1, ?2, ?3, 'PLA', ?4, ?5, ?6, ?7)",
                rusqlite::params![id, brand, line, f.name, f.color, now, now],
            )?;
        }

        // Create project_filaments for favorited files
        let mut file_stmt = conn.prepare(
            "SELECT f.id, f.project_id, f.metadata FROM files f WHERE f.favorited = 1 AND json_extract(f.metadata, '$.filaments') IS NOT NULL"
        )?;

        let file_rows: Vec<(String, String, String)> = file_stmt.query_map([], |row| {
            Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?, row.get::<_, String>(2)?))
        })?.filter_map(|r| r.ok()).collect();

        for (file_id, project_id, metadata_json) in &file_rows {
            let metadata: serde_json::Value = match serde_json::from_str(metadata_json) {
                Ok(v) => v,
                Err(_) => continue,
            };
            if let Some(arr) = metadata.get("filaments").and_then(|v| v.as_array()) {
                for item in arr {
                    let color = item.get("color").and_then(|v| v.as_str()).unwrap_or("");
                    let name = item.get("name").and_then(|v| v.as_str()).unwrap_or("");
                    let brand_raw = item.get("brand").and_then(|v| v.as_str()).unwrap_or("");

                    let pf_id = Uuid::new_v4().to_string();
                    conn.execute(
                        "INSERT INTO project_filaments (id, project_id, file_id, parsed_color, parsed_brand, parsed_name, match_status)
                         VALUES (?1, ?2, ?3, ?4, ?5, ?6, 'unmatched')",
                        rusqlite::params![pf_id, project_id, file_id, color, brand_raw, name],
                    )?;
                }
            }
        }

        // Now run matching for all project_filaments
        Self::run_matching_all(conn)?;

        // Apply existing substitutions as confirmed matches
        let subs = config::get_substitutions();
        if !subs.is_empty() {
            for (from_key, _) in &subs {
                let resolved_key = config::resolve_filament_key(from_key, &subs);
                if resolved_key == *from_key { continue; }
                let (_tc, tb, tn) = config::parse_filament_key(&resolved_key);
                let (target_brand, target_line) = Self::split_brand_line(&tb);

                // Find the curated filament matching the target
                let curated_id: Option<String> = conn.query_row(
                    "SELECT id FROM shared.curated_filaments WHERE LOWER(brand) = LOWER(?1) AND LOWER(line) = LOWER(?2) AND LOWER(name) = LOWER(?3)",
                    rusqlite::params![target_brand, target_line, tn],
                    |row| row.get(0),
                ).ok();

                if let Some(cid) = curated_id {
                    let (fc, _fb, fn_) = config::parse_filament_key(from_key);
                    conn.execute(
                        "UPDATE project_filaments SET curated_filament_id = ?1, match_status = 'confirmed'
                         WHERE LOWER(parsed_color) = LOWER(?2) AND LOWER(parsed_name) = LOWER(?3) AND curated_filament_id IS NULL",
                        rusqlite::params![cid, fc, fn_],
                    )?;
                }
            }
        }

        Ok(())
    }

    /// Load all curated filaments with pre-computed lowercase fields for efficient matching.
    pub(crate) fn load_curated_filaments(conn: &Connection) -> Result<Vec<CuratedFilamentRow>> {
        let mut cf_stmt = conn.prepare(
            "SELECT id, brand, line, name, material, color FROM shared.curated_filaments"
        )?;
        let curated: Vec<CuratedFilamentRow> = cf_stmt.query_map([], |row| {
            let brand: String = row.get(1)?;
            let line: String = row.get(2)?;
            let name: String = row.get(3)?;
            let brand_lower = brand.to_lowercase();
            let line_lower = line.to_lowercase();
            let name_lower = name.to_lowercase();
            let full_brand_lower = format!("{} {}", brand_lower, line_lower);
            let brand_norm = format!("{}{}", brand, line).to_lowercase().replace([' ', '-', '_'], "");
            Ok(CuratedFilamentRow {
                id: row.get(0)?,
                brand,
                line,
                name,
                material: row.get(4)?,
                color: row.get(5)?,
                brand_lower,
                line_lower,
                name_lower,
                full_brand_lower,
                brand_norm,
            })
        })?.filter_map(|r| r.ok()).collect();
        Ok(curated)
    }

    pub fn run_matching_all(conn: &Connection) -> Result<()> {
        let curated = Self::load_curated_filaments(conn)?;

        // Get all unmatched project_filaments
        let mut stmt = conn.prepare(
            "SELECT pf.id, pf.parsed_color, pf.parsed_brand, pf.parsed_name FROM project_filaments pf WHERE pf.match_status = 'unmatched'"
        )?;
        let unmatched: Vec<(String, String, String, String)> = stmt.query_map([], |row| {
            Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?, row.get::<_, String>(2)?, row.get::<_, String>(3)?))
        })?.filter_map(|r| r.ok()).collect();

        for (pf_id, parsed_color, parsed_brand, parsed_name) in &unmatched {
            if let Some((curated_id, status)) = Self::find_match_in_memory(&curated, parsed_color, parsed_brand, parsed_name) {
                conn.execute(
                    "UPDATE project_filaments SET curated_filament_id = ?1, match_status = ?2 WHERE id = ?3",
                    rusqlite::params![curated_id, status, pf_id],
                )?;
            }
        }
        Ok(())
    }

    /// Strip material prefix and brand+line prefix from a parsed name.
    /// e.g. "PLA BambuLab Basic Black" with brand "BambuLab" line "Basic" → "Black"
    fn strip_name_prefixes(parsed_name: &str, brand: &str, line: &str, material: &str) -> String {
        let mut name = parsed_name.to_string();

        // Strip material prefix (e.g. "PLA ", "PETG ", "ABS ")
        let name_lower = name.to_lowercase();
        let mat_lower = material.to_lowercase();
        if !mat_lower.is_empty() && name_lower.starts_with(&mat_lower) {
            let rest = name[mat_lower.len()..].trim_start();
            if !rest.is_empty() {
                name = rest.to_string();
            }
        }

        // Strip brand prefix
        let name_lower = name.to_lowercase();
        let brand_lower = brand.to_lowercase();
        if !brand_lower.is_empty() && name_lower.starts_with(&brand_lower) {
            let rest = name[brand_lower.len()..].trim_start();
            if !rest.is_empty() {
                name = rest.to_string();
            }
        }

        // Strip line prefix
        let name_lower = name.to_lowercase();
        let line_lower = line.to_lowercase();
        if !line_lower.is_empty() && name_lower.starts_with(&line_lower) {
            let rest = name[line_lower.len()..].trim_start();
            if !rest.is_empty() {
                name = rest.to_string();
            }
        }

        name
    }

    /// Common materials used as prefixes in HueForge filament names
    const KNOWN_MATERIALS: &'static [&'static str] = &[
        "PLA", "PETG", "ABS", "ASA", "TPU", "SILK", "PLA+", "PLA-CF", "PETG-CF",
        "PA", "PA-CF", "PC", "PVA", "HIPS",
    ];

    /// Try to strip any known material prefix from a name
    fn strip_any_material_prefix(parsed_name: &str) -> String {
        let name_lower = parsed_name.to_lowercase();
        for mat in Self::KNOWN_MATERIALS {
            let mat_lower = mat.to_lowercase();
            if name_lower.starts_with(&mat_lower) {
                let rest = parsed_name[mat_lower.len()..].trim_start();
                if !rest.is_empty() {
                    return rest.to_string();
                }
            }
        }
        parsed_name.to_string()
    }

    /// Find a matching curated filament. Returns (curated_id, match_status).
    /// This version queries the DB and is used for single-filament matching.
    pub fn find_match(conn: &Connection, parsed_color: &str, parsed_brand: &str, parsed_name: &str) -> Result<Option<(String, String)>> {
        // Load all curated filaments and delegate to in-memory matcher
        let curated = Self::load_curated_filaments(conn)?;
        Ok(Self::find_match_in_memory(&curated, parsed_color, parsed_brand, parsed_name))
    }

    /// Find a matching curated filament from a pre-loaded slice. Returns (curated_id, match_status).
    /// Used by `run_matching_all` to avoid repeated DB queries.
    pub(crate) fn find_match_in_memory(curated: &[CuratedFilamentRow], parsed_color: &str, parsed_brand: &str, parsed_name: &str) -> Option<(String, String)> {
        let (brand_part, _line_part) = Self::split_brand_line(parsed_brand);
        let brand_part_lower = brand_part.to_lowercase();
        let parsed_brand_lower = parsed_brand.to_lowercase();

        // Build candidate name variants: original + stripped of known material prefix
        let name_no_material = Self::strip_any_material_prefix(parsed_name);
        let name_variants: Vec<&str> = if name_no_material != parsed_name {
            vec![parsed_name, &name_no_material]
        } else {
            vec![parsed_name]
        };

        // 1. Exact match: brand matches AND name matches exactly
        for name_var in &name_variants {
            let name_var_lower = name_var.to_lowercase();

            for c in curated {
                if c.brand_lower == brand_part_lower && c.name_lower == name_var_lower {
                    return Some((c.id.clone(), "exact".to_string()));
                }
            }

            // Also try with concatenated brand+line matching parsed_brand
            for c in curated {
                if c.full_brand_lower == parsed_brand_lower && c.name_lower == name_var_lower {
                    return Some((c.id.clone(), "exact".to_string()));
                }
            }
        }

        // 2. Fuzzy match: normalize brands, check name similarity
        let normalized_brand = parsed_brand.to_lowercase().replace([' ', '-', '_'], "");

        for c in curated {
            if c.brand_norm == normalized_brand || c.brand_lower == brand_part_lower {
                // Try matching with progressively stripped parsed name
                let stripped = Self::strip_name_prefixes(parsed_name, &c.brand, &c.line, &c.material);
                let names_to_try = [parsed_name.to_string(), name_no_material.clone(), stripped];

                for pn in &names_to_try {
                    let pn_lower = pn.to_lowercase();
                    if pn_lower == c.name_lower {
                        return Some((c.id.clone(), "exact".to_string()));
                    }
                    if pn_lower.contains(&c.name_lower) || c.name_lower.contains(&pn_lower) {
                        return Some((c.id.clone(), "guessed".to_string()));
                    }
                    if Self::edit_distance(&pn_lower, &c.name_lower, 2) <= 2 {
                        return Some((c.id.clone(), "guessed".to_string()));
                    }
                }
            }
        }

        // 3. Color fallback: same brand, close color
        if parsed_color.starts_with('#') && parsed_color.len() == 7 {
            if let Some(parsed_rgb) = Self::hex_to_rgb(parsed_color) {
                let brand_part_norm = brand_part.to_lowercase().replace([' ', '-', '_'], "");
                for c in curated {
                    let curated_brand_norm_simple = c.brand_lower.replace([' ', '-', '_'], "");
                    if curated_brand_norm_simple != brand_part_norm && c.brand_norm != normalized_brand && curated_brand_norm_simple != normalized_brand {
                        continue;
                    }
                    if let Some(curated_rgb) = Self::hex_to_rgb(&c.color) {
                        let dist = Self::color_distance(&parsed_rgb, &curated_rgb);
                        if dist < 30.0 {
                            return Some((c.id.clone(), "guessed".to_string()));
                        }
                    }
                }
            }
        }

        None
    }

    fn hex_to_rgb(hex: &str) -> Option<(f64, f64, f64)> {
        if hex.len() != 7 || !hex.starts_with('#') { return None; }
        let r = u8::from_str_radix(&hex[1..3], 16).ok()? as f64;
        let g = u8::from_str_radix(&hex[3..5], 16).ok()? as f64;
        let b = u8::from_str_radix(&hex[5..7], 16).ok()? as f64;
        Some((r, g, b))
    }

    fn color_distance(a: &(f64, f64, f64), b: &(f64, f64, f64)) -> f64 {
        ((a.0 - b.0).powi(2) + (a.1 - b.1).powi(2) + (a.2 - b.2).powi(2)).sqrt()
    }

    fn edit_distance(a: &str, b: &str, max_dist: usize) -> usize {
        let a: Vec<char> = a.chars().collect();
        let b: Vec<char> = b.chars().collect();
        let m = a.len();
        let n = b.len();
        if m.abs_diff(n) > max_dist { return max_dist + 1; }
        if m == 0 { return n; }
        if n == 0 { return m; }
        let mut prev: Vec<usize> = (0..=n).collect();
        let mut curr = vec![0; n + 1];
        for i in 1..=m {
            curr[0] = i;
            let mut row_min = curr[0];
            for j in 1..=n {
                let cost = if a[i-1] == b[j-1] { 0 } else { 1 };
                curr[j] = (prev[j] + 1).min(curr[j-1] + 1).min(prev[j-1] + cost);
                row_min = row_min.min(curr[j]);
            }
            if row_min > max_dist { return max_dist + 1; }
            std::mem::swap(&mut prev, &mut curr);
        }
        prev[n]
    }
}
