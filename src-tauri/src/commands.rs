use crate::db::Database;
use crate::models::*;
use std::fs;
use tauri::State;
use uuid::Uuid;
use chrono::Utc;

type CmdResult<T> = Result<T, String>;

fn map_err<E: std::fmt::Display>(e: E) -> String {
    e.to_string()
}

// ── Projects ──

#[tauri::command]
pub fn create_project(db: State<Database>, req: CreateProjectRequest) -> CmdResult<Project> {
    let conn = db.conn.lock().map_err(map_err)?;
    let id = Uuid::new_v4().to_string();
    let now = Utc::now().to_rfc3339();
    let description = req.description.unwrap_or_default();

    conn.execute(
        "INSERT INTO projects (id, name, description, created_at, updated_at) VALUES (?1, ?2, ?3, ?4, ?5)",
        rusqlite::params![id, req.name, description, now, now],
    ).map_err(map_err)?;

    // Create project directory
    let project_dir = Database::data_dir().join("projects").join(&id);
    for sub in &["affinity", "hueforge", "bambulab", "thumbnails"] {
        fs::create_dir_all(project_dir.join(sub)).map_err(map_err)?;
    }

    Ok(Project {
        id,
        name: req.name,
        description,
        thumbnail_path: None,
        created_at: now.clone(),
        updated_at: now,
        tags: vec![],
        collections: vec![],
    })
}

#[tauri::command]
pub fn get_project(db: State<Database>, id: String) -> CmdResult<Project> {
    let conn = db.conn.lock().map_err(map_err)?;

    let mut stmt = conn.prepare(
        "SELECT id, name, description, thumbnail_path, created_at, updated_at FROM projects WHERE id = ?1"
    ).map_err(map_err)?;

    let project = stmt.query_row(rusqlite::params![id], |row| {
        Ok(Project {
            id: row.get(0)?,
            name: row.get(1)?,
            description: row.get(2)?,
            thumbnail_path: row.get(3)?,
            created_at: row.get(4)?,
            updated_at: row.get(5)?,
            tags: vec![],
            collections: vec![],
        })
    }).map_err(map_err)?;

    let tags = get_project_tags(&conn, &project.id).map_err(map_err)?;
    let collections = get_project_collections(&conn, &project.id).map_err(map_err)?;

    Ok(Project { tags, collections, ..project })
}

#[tauri::command]
pub fn update_project(db: State<Database>, id: String, req: UpdateProjectRequest) -> CmdResult<()> {
    let conn = db.conn.lock().map_err(map_err)?;
    let now = Utc::now().to_rfc3339();

    if let Some(name) = &req.name {
        conn.execute("UPDATE projects SET name = ?1, updated_at = ?2 WHERE id = ?3",
            rusqlite::params![name, now, id]).map_err(map_err)?;
    }
    if let Some(description) = &req.description {
        conn.execute("UPDATE projects SET description = ?1, updated_at = ?2 WHERE id = ?3",
            rusqlite::params![description, now, id]).map_err(map_err)?;
    }

    Ok(())
}

#[tauri::command]
pub fn delete_project(db: State<Database>, id: String) -> CmdResult<()> {
    let conn = db.conn.lock().map_err(map_err)?;
    conn.execute("DELETE FROM projects WHERE id = ?1", rusqlite::params![id]).map_err(map_err)?;

    // Remove project files
    let project_dir = Database::data_dir().join("projects").join(&id);
    if project_dir.exists() {
        fs::remove_dir_all(&project_dir).map_err(map_err)?;
    }

    Ok(())
}

#[tauri::command]
pub fn list_projects(db: State<Database>, req: ListProjectsRequest) -> CmdResult<Vec<ProjectSummary>> {
    let conn = db.conn.lock().map_err(map_err)?;

    let mut conditions = vec!["1=1".to_string()];
    let mut params: Vec<Box<dyn rusqlite::types::ToSql>> = vec![];
    let mut param_idx = 1;

    // Full-text search
    if let Some(search) = &req.search {
        if !search.is_empty() {
            conditions.push(format!(
                "p.rowid IN (SELECT rowid FROM projects_fts WHERE projects_fts MATCH ?{})",
                param_idx
            ));
            // FTS5 prefix search
            let search_term = format!("{}*", search.replace('"', ""));
            params.push(Box::new(search_term));
            param_idx += 1;
        }
    }

    // Filter by collection
    if let Some(collection_id) = &req.collection_id {
        conditions.push(format!(
            "p.id IN (SELECT project_id FROM project_collections WHERE collection_id = ?{})",
            param_idx
        ));
        params.push(Box::new(collection_id.clone()));
        param_idx += 1;
    }

    // Filter by tags (AND logic — project must have all specified tags)
    if let Some(tag_ids) = &req.tag_ids {
        if !tag_ids.is_empty() {
            for tag_id in tag_ids {
                conditions.push(format!(
                    "p.id IN (SELECT project_id FROM project_tags WHERE tag_id = ?{})",
                    param_idx
                ));
                params.push(Box::new(tag_id.clone()));
                param_idx += 1;
            }
        }
    }

    // Filter by asset types
    if let Some(asset_types) = &req.asset_types {
        if !asset_types.is_empty() {
            for at in asset_types {
                conditions.push(format!(
                    "p.id IN (SELECT project_id FROM assets WHERE asset_type = ?{})",
                    param_idx
                ));
                params.push(Box::new(at.clone()));
                param_idx += 1;
            }
        }
    }

    let sort_col = match req.sort_by.as_deref() {
        Some("name") => "p.name",
        Some("created_at") => "p.created_at",
        _ => "p.updated_at",
    };
    let sort_dir = match req.sort_order.as_deref() {
        Some("asc") => "ASC",
        _ => "DESC",
    };

    let sql = format!(
        "SELECT p.id, p.name, p.thumbnail_path, p.created_at, p.updated_at FROM projects p WHERE {} ORDER BY {} {}",
        conditions.join(" AND "), sort_col, sort_dir
    );

    let mut stmt = conn.prepare(&sql).map_err(map_err)?;
    let param_refs: Vec<&dyn rusqlite::types::ToSql> = params.iter().map(|p| p.as_ref()).collect();

    let rows = stmt.query_map(param_refs.as_slice(), |row| {
        Ok(ProjectSummary {
            id: row.get(0)?,
            name: row.get(1)?,
            thumbnail_path: row.get(2)?,
            created_at: row.get(3)?,
            updated_at: row.get(4)?,
            tags: vec![],
            asset_types: vec![],
        })
    }).map_err(map_err)?;

    let mut projects: Vec<ProjectSummary> = Vec::new();
    for row in rows {
        let mut p = row.map_err(map_err)?;
        p.tags = get_project_tags(&conn, &p.id).map_err(map_err)?;
        p.asset_types = get_project_asset_types(&conn, &p.id).map_err(map_err)?;
        projects.push(p);
    }

    Ok(projects)
}

// ── Tags ──

#[tauri::command]
pub fn create_tag(db: State<Database>, req: CreateTagRequest) -> CmdResult<Tag> {
    let conn = db.conn.lock().map_err(map_err)?;
    let id = Uuid::new_v4().to_string();
    let color = req.color.unwrap_or_else(|| "#6366f1".to_string());

    conn.execute(
        "INSERT INTO tags (id, name, color) VALUES (?1, ?2, ?3)",
        rusqlite::params![id, req.name, color],
    ).map_err(map_err)?;

    Ok(Tag { id, name: req.name, color })
}

#[tauri::command]
pub fn list_tags(db: State<Database>) -> CmdResult<Vec<TagWithCount>> {
    let conn = db.conn.lock().map_err(map_err)?;
    let mut stmt = conn.prepare(
        "SELECT t.id, t.name, t.color, COUNT(pt.project_id) as cnt
         FROM tags t LEFT JOIN project_tags pt ON t.id = pt.tag_id
         GROUP BY t.id ORDER BY t.name"
    ).map_err(map_err)?;

    let rows = stmt.query_map([], |row| {
        Ok(TagWithCount {
            id: row.get(0)?,
            name: row.get(1)?,
            color: row.get(2)?,
            project_count: row.get(3)?,
        })
    }).map_err(map_err)?;

    rows.collect::<Result<Vec<_>, _>>().map_err(map_err)
}

#[tauri::command]
pub fn update_tag(db: State<Database>, id: String, req: UpdateTagRequest) -> CmdResult<()> {
    let conn = db.conn.lock().map_err(map_err)?;
    if let Some(name) = &req.name {
        conn.execute("UPDATE tags SET name = ?1 WHERE id = ?2", rusqlite::params![name, id]).map_err(map_err)?;
    }
    if let Some(color) = &req.color {
        conn.execute("UPDATE tags SET color = ?1 WHERE id = ?2", rusqlite::params![color, id]).map_err(map_err)?;
    }
    Ok(())
}

#[tauri::command]
pub fn delete_tag(db: State<Database>, id: String) -> CmdResult<()> {
    let conn = db.conn.lock().map_err(map_err)?;
    conn.execute("DELETE FROM tags WHERE id = ?1", rusqlite::params![id]).map_err(map_err)?;
    Ok(())
}

#[tauri::command]
pub fn set_project_tags(db: State<Database>, project_id: String, tag_ids: Vec<String>) -> CmdResult<()> {
    let conn = db.conn.lock().map_err(map_err)?;
    conn.execute("DELETE FROM project_tags WHERE project_id = ?1", rusqlite::params![project_id]).map_err(map_err)?;
    for tag_id in &tag_ids {
        conn.execute(
            "INSERT INTO project_tags (project_id, tag_id) VALUES (?1, ?2)",
            rusqlite::params![project_id, tag_id],
        ).map_err(map_err)?;
    }
    let now = Utc::now().to_rfc3339();
    conn.execute("UPDATE projects SET updated_at = ?1 WHERE id = ?2", rusqlite::params![now, project_id]).map_err(map_err)?;
    Ok(())
}

// ── Collections ──

#[tauri::command]
pub fn create_collection(db: State<Database>, req: CreateCollectionRequest) -> CmdResult<Collection> {
    let conn = db.conn.lock().map_err(map_err)?;
    let id = Uuid::new_v4().to_string();
    let now = Utc::now().to_rfc3339();
    let description = req.description.unwrap_or_default();

    conn.execute(
        "INSERT INTO collections (id, name, description, created_at, updated_at) VALUES (?1, ?2, ?3, ?4, ?5)",
        rusqlite::params![id, req.name, description, now, now],
    ).map_err(map_err)?;

    Ok(Collection {
        id, name: req.name, description,
        cover_image_path: None,
        created_at: now.clone(), updated_at: now,
        project_count: 0,
    })
}

#[tauri::command]
pub fn list_collections(db: State<Database>) -> CmdResult<Vec<Collection>> {
    let conn = db.conn.lock().map_err(map_err)?;
    let mut stmt = conn.prepare(
        "SELECT c.id, c.name, c.description, c.cover_image_path, c.created_at, c.updated_at, COUNT(pc.project_id) as cnt
         FROM collections c LEFT JOIN project_collections pc ON c.id = pc.collection_id
         GROUP BY c.id ORDER BY c.name"
    ).map_err(map_err)?;

    let rows = stmt.query_map([], |row| {
        Ok(Collection {
            id: row.get(0)?,
            name: row.get(1)?,
            description: row.get(2)?,
            cover_image_path: row.get(3)?,
            created_at: row.get(4)?,
            updated_at: row.get(5)?,
            project_count: row.get(6)?,
        })
    }).map_err(map_err)?;

    rows.collect::<Result<Vec<_>, _>>().map_err(map_err)
}

#[tauri::command]
pub fn update_collection(db: State<Database>, id: String, req: UpdateCollectionRequest) -> CmdResult<()> {
    let conn = db.conn.lock().map_err(map_err)?;
    let now = Utc::now().to_rfc3339();
    if let Some(name) = &req.name {
        conn.execute("UPDATE collections SET name = ?1, updated_at = ?2 WHERE id = ?3",
            rusqlite::params![name, now, id]).map_err(map_err)?;
    }
    if let Some(description) = &req.description {
        conn.execute("UPDATE collections SET description = ?1, updated_at = ?2 WHERE id = ?3",
            rusqlite::params![description, now, id]).map_err(map_err)?;
    }
    Ok(())
}

#[tauri::command]
pub fn delete_collection(db: State<Database>, id: String) -> CmdResult<()> {
    let conn = db.conn.lock().map_err(map_err)?;
    conn.execute("DELETE FROM collections WHERE id = ?1", rusqlite::params![id]).map_err(map_err)?;
    Ok(())
}

#[tauri::command]
pub fn add_project_to_collection(db: State<Database>, project_id: String, collection_id: String) -> CmdResult<()> {
    let conn = db.conn.lock().map_err(map_err)?;
    conn.execute(
        "INSERT OR IGNORE INTO project_collections (project_id, collection_id) VALUES (?1, ?2)",
        rusqlite::params![project_id, collection_id],
    ).map_err(map_err)?;
    Ok(())
}

#[tauri::command]
pub fn remove_project_from_collection(db: State<Database>, project_id: String, collection_id: String) -> CmdResult<()> {
    let conn = db.conn.lock().map_err(map_err)?;
    conn.execute(
        "DELETE FROM project_collections WHERE project_id = ?1 AND collection_id = ?2",
        rusqlite::params![project_id, collection_id],
    ).map_err(map_err)?;
    Ok(())
}

// ── Assets & Revisions ──

#[tauri::command]
pub fn get_project_assets(db: State<Database>, project_id: String) -> CmdResult<Vec<Asset>> {
    let conn = db.conn.lock().map_err(map_err)?;

    let mut asset_stmt = conn.prepare(
        "SELECT id, project_id, asset_type, created_at FROM assets WHERE project_id = ?1 ORDER BY asset_type"
    ).map_err(map_err)?;

    let assets = asset_stmt.query_map(rusqlite::params![project_id], |row| {
        Ok(Asset {
            id: row.get(0)?,
            project_id: row.get(1)?,
            asset_type: row.get(2)?,
            created_at: row.get(3)?,
            revisions: vec![],
        })
    }).map_err(map_err)?;

    let mut result = Vec::new();
    for asset in assets {
        let mut a = asset.map_err(map_err)?;
        let mut rev_stmt = conn.prepare(
            "SELECT id, asset_id, version_number, file_path, original_filename, notes, thumbnail_path, created_at
             FROM revisions WHERE asset_id = ?1 ORDER BY version_number"
        ).map_err(map_err)?;

        a.revisions = rev_stmt.query_map(rusqlite::params![a.id], |row| {
            Ok(Revision {
                id: row.get(0)?,
                asset_id: row.get(1)?,
                version_number: row.get(2)?,
                file_path: row.get(3)?,
                original_filename: row.get(4)?,
                notes: row.get(5)?,
                thumbnail_path: row.get(6)?,
                created_at: row.get(7)?,
            })
        }).map_err(map_err)?
        .collect::<Result<Vec<_>, _>>().map_err(map_err)?;

        result.push(a);
    }

    Ok(result)
}

#[tauri::command]
pub fn import_file(
    db: State<Database>,
    project_id: String,
    asset_type: String,
    source_path: String,
    notes: Option<String>,
) -> CmdResult<Revision> {
    let conn = db.conn.lock().map_err(map_err)?;

    // Validate asset type
    if !["affinity", "hueforge", "bambulab"].contains(&asset_type.as_str()) {
        return Err(format!("Invalid asset type: {}", asset_type));
    }

    // Find or create asset for this project + type
    let asset_id: String = conn.query_row(
        "SELECT id FROM assets WHERE project_id = ?1 AND asset_type = ?2",
        rusqlite::params![project_id, asset_type],
        |row| row.get(0),
    ).unwrap_or_else(|_| {
        let new_id = Uuid::new_v4().to_string();
        let now = Utc::now().to_rfc3339();
        conn.execute(
            "INSERT INTO assets (id, project_id, asset_type, created_at) VALUES (?1, ?2, ?3, ?4)",
            rusqlite::params![new_id, project_id, asset_type, now],
        ).expect("Failed to create asset");
        new_id
    });

    // Get next version number
    let next_version: i32 = conn.query_row(
        "SELECT COALESCE(MAX(version_number), 0) + 1 FROM revisions WHERE asset_id = ?1",
        rusqlite::params![asset_id],
        |row| row.get(0),
    ).map_err(map_err)?;

    // Copy file to managed storage
    let source = std::path::Path::new(&source_path);
    let original_filename = source.file_name()
        .map(|f| f.to_string_lossy().to_string())
        .unwrap_or_else(|| "unknown".to_string());

    let dest_dir = Database::data_dir()
        .join("projects")
        .join(&project_id)
        .join(&asset_type)
        .join(format!("v{}", next_version));
    fs::create_dir_all(&dest_dir).map_err(map_err)?;

    let dest_path = dest_dir.join(&original_filename);
    fs::copy(&source_path, &dest_path).map_err(map_err)?;

    // Insert revision
    let rev_id = Uuid::new_v4().to_string();
    let now = Utc::now().to_rfc3339();
    let dest_path_str = dest_path.to_string_lossy().to_string();

    let notes_str = notes.unwrap_or_default();

    conn.execute(
        "INSERT INTO revisions (id, asset_id, version_number, file_path, original_filename, notes, created_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)",
        rusqlite::params![rev_id, asset_id, next_version, dest_path_str, original_filename, notes_str, now],
    ).map_err(map_err)?;

    // Update project timestamp
    conn.execute("UPDATE projects SET updated_at = ?1 WHERE id = ?2",
        rusqlite::params![now, project_id]).map_err(map_err)?;

    Ok(Revision {
        id: rev_id,
        asset_id,
        version_number: next_version,
        file_path: dest_path_str,
        original_filename,
        notes: notes_str,
        thumbnail_path: None,
        created_at: now,
    })
}

#[tauri::command]
pub fn set_project_thumbnail(db: State<Database>, project_id: String, source_path: String) -> CmdResult<String> {
    let conn = db.conn.lock().map_err(map_err)?;

    let dest_dir = Database::data_dir().join("projects").join(&project_id).join("thumbnails");
    fs::create_dir_all(&dest_dir).map_err(map_err)?;

    let source = std::path::Path::new(&source_path);
    let ext = source.extension().map(|e| e.to_string_lossy().to_string()).unwrap_or_else(|| "png".to_string());
    let dest_path = dest_dir.join(format!("cover.{}", ext));

    fs::copy(&source_path, &dest_path).map_err(map_err)?;

    let dest_str = dest_path.to_string_lossy().to_string();
    let now = Utc::now().to_rfc3339();
    conn.execute(
        "UPDATE projects SET thumbnail_path = ?1, updated_at = ?2 WHERE id = ?3",
        rusqlite::params![dest_str, now, project_id],
    ).map_err(map_err)?;

    Ok(dest_str)
}

#[tauri::command]
pub fn delete_revision(db: State<Database>, revision_id: String) -> CmdResult<()> {
    let conn = db.conn.lock().map_err(map_err)?;

    // Get file path before deleting
    let file_path: String = conn.query_row(
        "SELECT file_path FROM revisions WHERE id = ?1",
        rusqlite::params![revision_id],
        |row| row.get(0),
    ).map_err(map_err)?;

    conn.execute("DELETE FROM revisions WHERE id = ?1", rusqlite::params![revision_id]).map_err(map_err)?;

    // Remove file and parent version directory
    let path = std::path::Path::new(&file_path);
    if path.exists() {
        if let Some(parent) = path.parent() {
            fs::remove_dir_all(parent).ok();
        }
    }

    Ok(())
}

// ── Helpers ──

fn get_project_tags(conn: &Connection, project_id: &str) -> Result<Vec<Tag>, rusqlite::Error> {
    let mut stmt = conn.prepare(
        "SELECT t.id, t.name, t.color FROM tags t
         INNER JOIN project_tags pt ON t.id = pt.tag_id
         WHERE pt.project_id = ?1 ORDER BY t.name"
    )?;
    let rows = stmt.query_map(rusqlite::params![project_id], |row| {
        Ok(Tag { id: row.get(0)?, name: row.get(1)?, color: row.get(2)? })
    })?;
    rows.collect()
}

fn get_project_collections(conn: &Connection, project_id: &str) -> Result<Vec<CollectionSummary>, rusqlite::Error> {
    let mut stmt = conn.prepare(
        "SELECT c.id, c.name FROM collections c
         INNER JOIN project_collections pc ON c.id = pc.collection_id
         WHERE pc.project_id = ?1 ORDER BY c.name"
    )?;
    let rows = stmt.query_map(rusqlite::params![project_id], |row| {
        Ok(CollectionSummary { id: row.get(0)?, name: row.get(1)? })
    })?;
    rows.collect()
}

fn get_project_asset_types(conn: &Connection, project_id: &str) -> Result<Vec<String>, rusqlite::Error> {
    let mut stmt = conn.prepare(
        "SELECT DISTINCT asset_type FROM assets WHERE project_id = ?1 ORDER BY asset_type"
    )?;
    let rows = stmt.query_map(rusqlite::params![project_id], |row| row.get(0))?;
    rows.collect()
}

use rusqlite::Connection;
