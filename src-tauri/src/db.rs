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
        dirs::home_dir()
            .expect("Could not find home directory")
            .join("3dPrintManager")
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
