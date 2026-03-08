use crate::config;
use rusqlite::{Connection, Result};
use std::fs;
use std::path::PathBuf;
use std::sync::Mutex;

pub struct Database {
    pub conn: Mutex<Connection>,
}

impl Database {
    pub fn new() -> Result<Self> {
        let db_path = Self::db_path();
        if let Some(parent) = db_path.parent() {
            fs::create_dir_all(parent).expect("Failed to create data directory");
        }
        let conn = Connection::open(&db_path)?;
        let db = Self {
            conn: Mutex::new(conn),
        };
        db.run_migrations()?;
        Ok(db)
    }

    pub fn data_dir() -> PathBuf {
        config::library_path()
    }

    fn db_path() -> PathBuf {
        Self::data_dir().join("db.sqlite")
    }

    fn run_migrations(&self) -> Result<()> {
        let conn = self.conn.lock().unwrap();
        conn.execute_batch("PRAGMA journal_mode=WAL;")?;
        conn.execute_batch("PRAGMA foreign_keys=ON;")?;

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

        Ok(())
    }
}
