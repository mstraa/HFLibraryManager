use crate::config;
use crate::db::Database;
use crate::models::*;
use crate::thumbnails;
use std::fs;
use std::path::Path;
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
        "INSERT INTO projects (id, name, description, creator, created_at, updated_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
        rusqlite::params![id, req.name, description, "Me", now, now],
    ).map_err(map_err)?;

    // Create project directory
    let project_dir = Database::data_dir().join("projects").join(&id);
    for sub in &["files", "thumbnails"] {
        fs::create_dir_all(project_dir.join(sub)).map_err(map_err)?;
    }

    Ok(Project {
        id,
        name: req.name,
        description,
        creator: "Me".to_string(),
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
        "SELECT id, name, description, creator, thumbnail_path, created_at, updated_at FROM projects WHERE id = ?1"
    ).map_err(map_err)?;

    let project = stmt.query_row(rusqlite::params![id], |row| {
        Ok(Project {
            id: row.get(0)?,
            name: row.get(1)?,
            description: row.get(2)?,
            creator: row.get(3)?,
            thumbnail_path: row.get(4)?,
            created_at: row.get(5)?,
            updated_at: row.get(6)?,
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
    if let Some(creator) = &req.creator {
        conn.execute("UPDATE projects SET creator = ?1, updated_at = ?2 WHERE id = ?3",
            rusqlite::params![creator, now, id]).map_err(map_err)?;
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

    // Filter by creator
    if let Some(creator) = &req.creator {
        if !creator.is_empty() {
            conditions.push(format!("p.creator = ?{}", param_idx));
            params.push(Box::new(creator.clone()));
            param_idx += 1;
        }
    }

    // Filter by filaments (format: ["#hexcolor", ...]) — AND logic, match by hex color
    if let Some(filaments) = &req.filaments {
        for filament in filaments {
            conditions.push(format!(
                "p.id IN (SELECT f.project_id FROM files f, json_each(json_extract(f.metadata, '$.filaments')) AS je \
                 WHERE f.favorited = 1 AND LOWER(json_extract(je.value, '$.color')) = ?{})",
                param_idx
            ));
            params.push(Box::new(filament.to_lowercase()));
            param_idx += 1;
        }
    }

    // Filter by size (format: "50x50mm")
    if let Some(size) = &req.size {
        if !size.is_empty() {
            conditions.push(format!(
                "p.id IN (SELECT f.project_id FROM files f \
                 WHERE f.favorited = 1 \
                 AND CAST(ROUND(json_extract(f.metadata, '$.width_mm')) AS INTEGER) || 'x' || \
                     CAST(ROUND(json_extract(f.metadata, '$.height_mm')) AS INTEGER) || 'mm' = ?{})",
                param_idx
            ));
            params.push(Box::new(size.clone()));
            param_idx += 1;
        }
    }

    let _ = param_idx; // suppress unused warning

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
        "SELECT p.id, p.name, p.creator, p.thumbnail_path, p.created_at, p.updated_at,
                (SELECT COUNT(*) FROM files f WHERE f.project_id = p.id) as file_count
         FROM projects p WHERE {} ORDER BY {} {}",
        conditions.join(" AND "), sort_col, sort_dir
    );

    let mut stmt = conn.prepare(&sql).map_err(map_err)?;
    let param_refs: Vec<&dyn rusqlite::types::ToSql> = params.iter().map(|p| p.as_ref()).collect();

    let rows = stmt.query_map(param_refs.as_slice(), |row| {
        Ok(ProjectSummary {
            id: row.get(0)?,
            name: row.get(1)?,
            creator: row.get(2)?,
            thumbnail_path: row.get(3)?,
            created_at: row.get(4)?,
            updated_at: row.get(5)?,
            tags: vec![],
            file_count: row.get(6)?,
            filaments: vec![],
            size: None,
        })
    }).map_err(map_err)?;

    let mut projects: Vec<ProjectSummary> = Vec::new();
    for row in rows {
        let mut p = row.map_err(map_err)?;
        p.tags = get_project_tags(&conn, &p.id).map_err(map_err)?;
        p.filaments = get_project_filaments(&conn, &p.id).map_err(map_err)?;
        p.size = get_project_size(&conn, &p.id).map_err(map_err)?;
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

// ── Files ──

#[tauri::command]
pub fn get_project_files(db: State<Database>, project_id: String) -> CmdResult<Vec<ProjectFile>> {
    let conn = db.conn.lock().map_err(map_err)?;

    let mut stmt = conn.prepare(
        "SELECT id, project_id, file_path, original_filename, file_size, notes, thumbnail_path, favorited, metadata, created_at
         FROM files WHERE project_id = ?1 ORDER BY created_at DESC"
    ).map_err(map_err)?;

    let rows = stmt.query_map(rusqlite::params![project_id], |row| {
        Ok(ProjectFile {
            id: row.get(0)?,
            project_id: row.get(1)?,
            file_path: row.get(2)?,
            original_filename: row.get(3)?,
            file_size: row.get(4)?,
            notes: row.get(5)?,
            thumbnail_path: row.get(6)?,
            favorited: row.get::<_, i32>(7)? != 0,
            metadata: row.get(8)?,
            created_at: row.get(9)?,
        })
    }).map_err(map_err)?;

    rows.collect::<Result<Vec<_>, _>>().map_err(map_err)
}

#[tauri::command]
pub fn import_files(
    db: State<Database>,
    project_id: String,
    source_paths: Vec<String>,
) -> CmdResult<Vec<ProjectFile>> {
    let conn = db.conn.lock().map_err(map_err)?;
    let files_dir = Database::data_dir()
        .join("projects")
        .join(&project_id)
        .join("files");
    fs::create_dir_all(&files_dir).map_err(map_err)?;

    let thumb_dir = Database::data_dir()
        .join("projects")
        .join(&project_id)
        .join("thumbnails");

    let mut result = Vec::new();
    let now = Utc::now().to_rfc3339();

    for source_path in &source_paths {
        let source = Path::new(source_path);
        let original_filename = source.file_name()
            .map(|f| f.to_string_lossy().to_string())
            .unwrap_or_else(|| "unknown".to_string());

        // Keep original filename, add suffix if duplicate
        let mut dest_path = files_dir.join(&original_filename);
        if dest_path.exists() {
            let stem = source.file_stem().map(|s| s.to_string_lossy().to_string()).unwrap_or_default();
            let ext = source.extension().map(|e| format!(".{}", e.to_string_lossy())).unwrap_or_default();
            let mut counter = 1;
            loop {
                dest_path = files_dir.join(format!("{} ({}){}", stem, counter, ext));
                if !dest_path.exists() { break; }
                counter += 1;
            }
        }

        let file_size = fs::metadata(source).map(|m| m.len() as i64).unwrap_or(0);
        fs::copy(source_path, &dest_path).map_err(map_err)?;

        let file_id = Uuid::new_v4().to_string();
        let dest_str = dest_path.to_string_lossy().to_string();
        let stored_filename = dest_path.file_name()
            .map(|f| f.to_string_lossy().to_string())
            .unwrap_or(original_filename.clone());

        // Auto-extract thumbnail for 3mf files
        let thumb_path = if original_filename.to_lowercase().ends_with(".3mf") {
            thumbnails::extract_3mf_thumbnail(&dest_path)
                .and_then(|bytes| {
                    thumbnails::generate_thumbnail(
                        &bytes,
                        &thumb_dir,
                        &format!("file_{}.png", file_id),
                    )
                })
                .map(|p| p.to_string_lossy().to_string())
        } else {
            None
        };

        conn.execute(
            "INSERT INTO files (id, project_id, file_path, original_filename, file_size, notes, thumbnail_path, created_at)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)",
            rusqlite::params![file_id, project_id, dest_str, stored_filename, file_size, "", thumb_path, now],
        ).map_err(map_err)?;

        // Auto-set project thumbnail from first 3mf if none set
        if thumb_path.is_some() {
            let has_thumb: bool = conn.query_row(
                "SELECT thumbnail_path IS NOT NULL FROM projects WHERE id = ?1",
                rusqlite::params![project_id],
                |row| row.get(0),
            ).unwrap_or(false);
            if !has_thumb {
                conn.execute(
                    "UPDATE projects SET thumbnail_path = ?1 WHERE id = ?2",
                    rusqlite::params![thumb_path, project_id],
                ).map_err(map_err)?;
            }
        }

        result.push(ProjectFile {
            id: file_id,
            project_id: project_id.clone(),
            file_path: dest_str,
            original_filename: stored_filename,
            file_size,
            notes: String::new(),
            thumbnail_path: thumb_path,
            favorited: false,
            metadata: "{}".to_string(),
            created_at: now.clone(),
        });
    }

    // Update project timestamp
    conn.execute("UPDATE projects SET updated_at = ?1 WHERE id = ?2",
        rusqlite::params![now, project_id]).map_err(map_err)?;

    Ok(result)
}

#[tauri::command]
pub fn delete_file(db: State<Database>, file_id: String) -> CmdResult<()> {
    let conn = db.conn.lock().map_err(map_err)?;

    let file_path: String = conn.query_row(
        "SELECT file_path FROM files WHERE id = ?1",
        rusqlite::params![file_id],
        |row| row.get(0),
    ).map_err(map_err)?;

    conn.execute("DELETE FROM files WHERE id = ?1", rusqlite::params![file_id]).map_err(map_err)?;

    let path = Path::new(&file_path);
    if path.exists() {
        fs::remove_file(path).ok();
    }

    Ok(())
}

#[tauri::command]
pub fn update_file_notes(db: State<Database>, file_id: String, notes: String) -> CmdResult<()> {
    let conn = db.conn.lock().map_err(map_err)?;
    conn.execute(
        "UPDATE files SET notes = ?1 WHERE id = ?2",
        rusqlite::params![notes, file_id],
    ).map_err(map_err)?;
    Ok(())
}

#[tauri::command]
pub fn toggle_file_favorite(db: State<Database>, file_id: String) -> CmdResult<bool> {
    let conn = db.conn.lock().map_err(map_err)?;
    let (current, file_path, filename): (i32, String, String) = conn.query_row(
        "SELECT favorited, file_path, original_filename FROM files WHERE id = ?1",
        rusqlite::params![file_id],
        |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?)),
    ).map_err(map_err)?;
    let new_val = if current != 0 { 0 } else { 1 };

    // Parse metadata when favoriting
    if new_val == 1 {
        let metadata = parse_file_metadata(&file_path, &filename);
        let metadata_json = serde_json::to_string(&metadata).unwrap_or_else(|_| "{}".to_string());
        conn.execute(
            "UPDATE files SET favorited = 1, metadata = ?1 WHERE id = ?2",
            rusqlite::params![metadata_json, file_id],
        ).map_err(map_err)?;

    } else {
        conn.execute(
            "UPDATE files SET favorited = 0, metadata = '{}' WHERE id = ?1",
            rusqlite::params![file_id],
        ).map_err(map_err)?;
    }

    Ok(new_val != 0)
}

fn parse_file_metadata(file_path: &str, filename: &str) -> FileMetadata {
    let ext = filename.rsplit('.').next().unwrap_or("").to_lowercase();
    match ext.as_str() {
        "txt" => parse_hueforge_txt(file_path),
        "hfp" => parse_hueforge_hfp(file_path),
        _ => FileMetadata::default(),
    }
}

fn parse_hueforge_txt(file_path: &str) -> FileMetadata {
    let content = match fs::read_to_string(file_path) {
        Ok(c) => c,
        Err(_) => return FileMetadata::default(),
    };

    let mut filaments: Vec<FilamentInfo> = Vec::new();
    let mut filament_count = None;
    let mut width_mm = None;
    let mut height_mm = None;
    let mut layer_height = None;
    let mut max_thickness = None;

    for line in content.lines() {
        let trimmed = line.trim();

        // Parse filament lines: "#c00d1e PLA BambuLab Basic Red  Transmission Distance: 4"
        if trimmed.starts_with('#') && trimmed.len() > 7 {
            let hex = &trimmed[..7];
            if hex.len() == 7 && hex[1..].chars().all(|c| c.is_ascii_hexdigit()) {
                let rest = trimmed[7..].trim();
                // Extract name before "Transmission Distance"
                let name_part = if let Some(idx) = rest.find("Transmission Distance") {
                    rest[..idx].trim()
                } else {
                    rest
                };
                // Split: "PLA BambuLab Basic Red" -> brand="BambuLab Basic", name="Red"
                let parts: Vec<&str> = name_part.split_whitespace().collect();
                let (brand, name) = if parts.len() >= 4 {
                    // parts[0] = material type (PLA), parts[1..n-1] = brand, parts[n-1] = color name
                    // Heuristic: brand is typically 2 words after material type
                    let brand = format!("{} {}", parts[1], parts[2]);
                    let color_name = parts[3..].join(" ");
                    (brand, color_name)
                } else if parts.len() == 3 {
                    (parts[1].to_string(), parts[2].to_string())
                } else {
                    (name_part.to_string(), name_part.to_string())
                };

                // Deduplicate
                if !filaments.iter().any(|f| f.color == hex && f.name == name) {
                    filaments.push(FilamentInfo {
                        color: hex.to_string(),
                        name,
                        brand,
                    });
                }
            }
        }

        // Parse filament count: "This print uses 5 unique filaments"
        if trimmed.contains("unique filament") {
            if let Some(num) = trimmed.split_whitespace()
                .find_map(|w| w.parse::<i32>().ok()) {
                filament_count = Some(num);
            }
        }

        // Parse size: "The Model is 50.03x50.03mm in size"
        if trimmed.contains("Model is") && trimmed.contains("mm in size") {
            if let Some(dims) = trimmed.split("Model is").nth(1) {
                if let Some(dims) = dims.split("mm").next() {
                    let dims = dims.trim();
                    let parts: Vec<&str> = dims.split('x').collect();
                    if parts.len() == 2 {
                        width_mm = parts[0].trim().parse().ok();
                        height_mm = parts[1].trim().parse().ok();
                    }
                }
            }
        }

        // Parse layer height: "layer height of 0.08mm"
        if trimmed.contains("layer height of") {
            if let Some(after) = trimmed.split("layer height of").nth(1) {
                if let Some(val) = after.trim().strip_suffix("mm") {
                    layer_height = val.trim().parse().ok();
                } else {
                    layer_height = after.split("mm").next()
                        .and_then(|v| v.trim().parse().ok());
                }
            }
        }

        // Parse max thickness: "Max allowed Thickness is 1.6mm"
        if trimmed.contains("Max allowed Thickness is") {
            if let Some(after) = trimmed.split("Max allowed Thickness is").nth(1) {
                max_thickness = after.split("mm").next()
                    .and_then(|v| v.trim().parse().ok());
            }
        }
    }

    FileMetadata {
        filament_count,
        filaments: if filaments.is_empty() { None } else { Some(filaments) },
        width_mm,
        height_mm,
        layer_height,
        max_thickness,
    }
}

fn parse_hueforge_hfp(file_path: &str) -> FileMetadata {
    let content = match fs::read_to_string(file_path) {
        Ok(c) => c,
        Err(_) => return FileMetadata::default(),
    };

    let json: serde_json::Value = match serde_json::from_str(&content) {
        Ok(v) => v,
        Err(_) => return FileMetadata::default(),
    };

    let width_mm = json.get("width_in_mm").and_then(|v| v.as_f64());
    let height_mm = json.get("height_in_mm").and_then(|v| v.as_f64());
    let layer_height = json.get("layer_height").and_then(|v| v.as_f64());
    let max_thickness = json.get("max_thickness").and_then(|v| v.as_f64());

    let mut filaments: Vec<FilamentInfo> = Vec::new();
    if let Some(arr) = json.get("filament_set").and_then(|v| v.as_array()) {
        for item in arr {
            let color = item.get("Color").and_then(|v| v.as_str()).unwrap_or("").to_string();
            let name = item.get("Name").and_then(|v| v.as_str()).unwrap_or("").to_string();
            let brand = item.get("Brand").and_then(|v| v.as_str()).unwrap_or("").to_string();
            if !color.is_empty() && !filaments.iter().any(|f| f.color == color && f.name == name) {
                filaments.push(FilamentInfo { color, name, brand });
            }
        }
    }

    FileMetadata {
        filament_count: if filaments.is_empty() { None } else { Some(filaments.len() as i32) },
        filaments: if filaments.is_empty() { None } else { Some(filaments) },
        width_mm,
        height_mm,
        layer_height,
        max_thickness,
    }
}

#[tauri::command]
pub fn set_project_thumbnail(db: State<Database>, project_id: String, source_path: String) -> CmdResult<String> {
    let conn = db.conn.lock().map_err(map_err)?;

    let dest_dir = Database::data_dir().join("projects").join(&project_id).join("thumbnails");
    let source = Path::new(&source_path);

    let is_svg = source.extension()
        .map(|e| e.to_ascii_lowercase() == "svg")
        .unwrap_or(false);

    let dest_path = if is_svg {
        // SVG can't be rasterized by the image crate — copy as-is
        fs::create_dir_all(&dest_dir).map_err(map_err)?;
        let dest = dest_dir.join("cover.svg");
        fs::copy(source, &dest).map_err(map_err)?;
        dest
    } else {
        thumbnails::generate_thumbnail_from_file(
            source,
            &dest_dir,
            "cover.png",
        ).ok_or_else(|| "Failed to generate thumbnail from image".to_string())?
    };

    let dest_str = dest_path.to_string_lossy().to_string();
    let now = Utc::now().to_rfc3339();
    conn.execute(
        "UPDATE projects SET thumbnail_path = ?1, updated_at = ?2 WHERE id = ?3",
        rusqlite::params![dest_str, now, project_id],
    ).map_err(map_err)?;

    Ok(dest_str)
}

/// List all file paths in a directory (non-recursive, files only, skip hidden)
#[tauri::command]
pub fn list_folder_files(path: String) -> CmdResult<Vec<String>> {
    let dir = Path::new(&path);
    if !dir.is_dir() {
        return Err("Not a directory".to_string());
    }
    let mut files: Vec<String> = Vec::new();
    for entry in fs::read_dir(dir).map_err(map_err)?.flatten() {
        let p = entry.path();
        if !p.is_file() { continue; }
        let name = p.file_name().map(|f| f.to_string_lossy().to_string()).unwrap_or_default();
        if name.starts_with('.') { continue; }
        files.push(p.to_string_lossy().to_string());
    }
    files.sort();
    Ok(files)
}

// ── File Operations ──

#[tauri::command]
pub fn open_file_in_default_app(path: String) -> CmdResult<()> {
    open::that(&path).map_err(map_err)
}

#[tauri::command]
pub fn reveal_in_finder(path: String) -> CmdResult<()> {
    let p = Path::new(&path);
    let folder = if p.is_file() { p.parent().unwrap_or(p) } else { p };
    open::that(folder).map_err(map_err)
}

#[tauri::command]
pub fn read_text_file(path: String) -> CmdResult<String> {
    fs::read_to_string(&path).map_err(map_err)
}

#[tauri::command]
pub fn sync_project_files(db: State<Database>, project_id: String) -> CmdResult<SyncResult> {
    let conn = db.conn.lock().map_err(map_err)?;
    let files_dir = Database::data_dir()
        .join("projects")
        .join(&project_id)
        .join("files");
    fs::create_dir_all(&files_dir).map_err(map_err)?;

    let thumb_dir = Database::data_dir()
        .join("projects")
        .join(&project_id)
        .join("thumbnails");

    let mut removed = 0i32;
    let mut added = 0i32;

    // 1. Remove DB entries whose files no longer exist on disk
    let mut stmt = conn.prepare(
        "SELECT id, file_path FROM files WHERE project_id = ?1"
    ).map_err(map_err)?;
    let existing: Vec<(String, String)> = stmt.query_map(rusqlite::params![project_id], |row| {
        Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?))
    }).map_err(map_err)?
    .filter_map(|r| r.ok())
    .collect();

    for (file_id, file_path) in &existing {
        if !Path::new(file_path).exists() {
            conn.execute("DELETE FROM files WHERE id = ?1", rusqlite::params![file_id]).map_err(map_err)?;
            removed += 1;
        }
    }

    // 2. Add files on disk that aren't tracked in DB
    let tracked_filenames: std::collections::HashSet<String> = existing.iter()
        .filter(|(_, fp)| Path::new(fp).exists())
        .filter_map(|(_, fp)| Path::new(fp).file_name().map(|f| f.to_string_lossy().to_string()))
        .collect();

    if files_dir.exists() {
        let now = Utc::now().to_rfc3339();
        for entry in fs::read_dir(&files_dir).map_err(map_err)?.flatten() {
            let path = entry.path();
            if !path.is_file() { continue; }
            let filename = path.file_name()
                .map(|f| f.to_string_lossy().to_string())
                .unwrap_or_default();
            if filename.starts_with('.') { continue; }
            if tracked_filenames.contains(&filename) { continue; }

            let file_size = fs::metadata(&path).map(|m| m.len() as i64).unwrap_or(0);
            let file_id = Uuid::new_v4().to_string();
            let file_path_str = path.to_string_lossy().to_string();

            let thumb_path = if filename.to_lowercase().ends_with(".3mf") {
                thumbnails::extract_3mf_thumbnail(&path)
                    .and_then(|bytes| {
                        thumbnails::generate_thumbnail(&bytes, &thumb_dir, &format!("file_{}.png", file_id))
                    })
                    .map(|p| p.to_string_lossy().to_string())
            } else {
                None
            };

            conn.execute(
                "INSERT INTO files (id, project_id, file_path, original_filename, file_size, notes, thumbnail_path, created_at)
                 VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)",
                rusqlite::params![file_id, project_id, file_path_str, filename, file_size, "", thumb_path, now],
            ).map_err(map_err)?;
            added += 1;
        }
    }

    Ok(SyncResult { added, removed })
}

// ── Creators ──

#[tauri::command]
pub fn list_creators(db: State<Database>) -> CmdResult<Vec<String>> {
    let conn = db.conn.lock().map_err(map_err)?;
    let mut stmt = conn.prepare(
        "SELECT DISTINCT creator FROM projects ORDER BY creator"
    ).map_err(map_err)?;
    let rows = stmt.query_map([], |row| row.get(0)).map_err(map_err)?;
    rows.collect::<Result<Vec<_>, _>>().map_err(map_err)
}

// ── Filament & Size Filters ──

#[tauri::command]
pub fn list_all_filaments(db: State<Database>) -> CmdResult<Vec<FilamentInfo>> {
    let conn = db.conn.lock().map_err(map_err)?;
    let mut stmt = conn.prepare(
        "SELECT color, name, brand FROM (
            SELECT
                json_extract(je.value, '$.color') as color,
                json_extract(je.value, '$.name') as name,
                json_extract(je.value, '$.brand') as brand,
                ROW_NUMBER() OVER (PARTITION BY LOWER(json_extract(je.value, '$.color')) ORDER BY LENGTH(json_extract(je.value, '$.name')) DESC) as rn
            FROM files, json_each(json_extract(files.metadata, '$.filaments')) AS je
            WHERE files.favorited = 1
              AND json_extract(files.metadata, '$.filaments') IS NOT NULL
         ) WHERE rn = 1
         ORDER BY brand, name"
    ).map_err(map_err)?;

    let rows = stmt.query_map([], |row| {
        Ok(FilamentInfo {
            color: row.get(0)?,
            name: row.get(1)?,
            brand: row.get(2)?,
        })
    }).map_err(map_err)?;

    rows.collect::<Result<Vec<_>, _>>().map_err(map_err)
}

#[tauri::command]
pub fn list_all_sizes(db: State<Database>) -> CmdResult<Vec<String>> {
    let conn = db.conn.lock().map_err(map_err)?;
    let mut stmt = conn.prepare(
        "SELECT DISTINCT
            CAST(ROUND(json_extract(metadata, '$.width_mm')) AS INTEGER) || 'x' ||
            CAST(ROUND(json_extract(metadata, '$.height_mm')) AS INTEGER) || 'mm' as size
         FROM files
         WHERE favorited = 1
           AND json_extract(metadata, '$.width_mm') IS NOT NULL
           AND json_extract(metadata, '$.height_mm') IS NOT NULL
         ORDER BY size"
    ).map_err(map_err)?;

    let rows = stmt.query_map([], |row| row.get(0)).map_err(map_err)?;
    rows.collect::<Result<Vec<_>, _>>().map_err(map_err)
}

// ── Data Export ──

#[tauri::command]
pub fn export_data(db: State<Database>) -> CmdResult<String> {
    let conn = db.conn.lock().map_err(map_err)?;

    let mut projects = Vec::new();
    {
        let mut stmt = conn.prepare(
            "SELECT id, name, description, thumbnail_path, created_at, updated_at FROM projects ORDER BY name"
        ).map_err(map_err)?;
        let rows = stmt.query_map([], |row| {
            Ok(serde_json::json!({
                "id": row.get::<_, String>(0)?,
                "name": row.get::<_, String>(1)?,
                "description": row.get::<_, String>(2)?,
                "thumbnail_path": row.get::<_, Option<String>>(3)?,
                "created_at": row.get::<_, String>(4)?,
                "updated_at": row.get::<_, String>(5)?,
            }))
        }).map_err(map_err)?;
        for row in rows {
            projects.push(row.map_err(map_err)?);
        }
    }

    let mut tags = Vec::new();
    {
        let mut stmt = conn.prepare("SELECT id, name, color FROM tags ORDER BY name").map_err(map_err)?;
        let rows = stmt.query_map([], |row| {
            Ok(serde_json::json!({
                "id": row.get::<_, String>(0)?,
                "name": row.get::<_, String>(1)?,
                "color": row.get::<_, String>(2)?,
            }))
        }).map_err(map_err)?;
        for row in rows {
            tags.push(row.map_err(map_err)?);
        }
    }

    let mut collections = Vec::new();
    {
        let mut stmt = conn.prepare(
            "SELECT id, name, description, created_at, updated_at FROM collections ORDER BY name"
        ).map_err(map_err)?;
        let rows = stmt.query_map([], |row| {
            Ok(serde_json::json!({
                "id": row.get::<_, String>(0)?,
                "name": row.get::<_, String>(1)?,
                "description": row.get::<_, String>(2)?,
                "created_at": row.get::<_, String>(3)?,
                "updated_at": row.get::<_, String>(4)?,
            }))
        }).map_err(map_err)?;
        for row in rows {
            collections.push(row.map_err(map_err)?);
        }
    }

    let export = serde_json::json!({
        "version": 1,
        "exported_at": Utc::now().to_rfc3339(),
        "projects": projects,
        "tags": tags,
        "collections": collections,
    });

    serde_json::to_string_pretty(&export).map_err(map_err)
}

#[tauri::command]
pub fn get_data_dir() -> String {
    Database::data_dir().to_string_lossy().to_string()
}

// ── Library Path ──

#[tauri::command]
pub fn get_library_path() -> String {
    config::library_path().to_string_lossy().to_string()
}

#[tauri::command]
pub fn set_library_path(path: String, move_data: bool) -> CmdResult<()> {
    let old_path = config::library_path();
    let new_path = std::path::PathBuf::from(&path);

    // Create the new directory
    fs::create_dir_all(&new_path).map_err(map_err)?;

    // Move existing data if requested
    if move_data && old_path.exists() && old_path != new_path {
        let old_projects = old_path.join("projects");
        let new_projects = new_path.join("projects");
        if old_projects.exists() && !new_projects.exists() {
            fs::rename(&old_projects, &new_projects).map_err(map_err)?;
        }

        let old_db = old_path.join("db.sqlite");
        let new_db = new_path.join("db.sqlite");
        if old_db.exists() && !new_db.exists() {
            fs::copy(&old_db, &new_db).map_err(map_err)?;
        }
        // Also copy WAL/SHM files if they exist
        for ext in &["db.sqlite-wal", "db.sqlite-shm"] {
            let old_f = old_path.join(ext);
            let new_f = new_path.join(ext);
            if old_f.exists() {
                let _ = fs::copy(&old_f, &new_f);
            }
        }
    }

    config::set_library_path(path)?;
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

fn get_project_filaments(conn: &Connection, project_id: &str) -> Result<Vec<FilamentInfo>, rusqlite::Error> {
    let mut stmt = conn.prepare(
        "SELECT color, name, brand FROM (
            SELECT
                json_extract(je.value, '$.color') as color,
                json_extract(je.value, '$.name') as name,
                json_extract(je.value, '$.brand') as brand,
                ROW_NUMBER() OVER (PARTITION BY LOWER(json_extract(je.value, '$.color')) ORDER BY LENGTH(json_extract(je.value, '$.name')) DESC) as rn
            FROM files f, json_each(json_extract(f.metadata, '$.filaments')) AS je
            WHERE f.project_id = ?1 AND f.favorited = 1
              AND json_extract(f.metadata, '$.filaments') IS NOT NULL
        ) WHERE rn = 1
        ORDER BY brand, name"
    )?;
    let rows = stmt.query_map(rusqlite::params![project_id], |row| {
        Ok(FilamentInfo { color: row.get(0)?, name: row.get(1)?, brand: row.get(2)? })
    })?;
    rows.collect()
}

fn get_project_size(conn: &Connection, project_id: &str) -> Result<Option<String>, rusqlite::Error> {
    let mut stmt = conn.prepare(
        "SELECT
            CAST(ROUND(json_extract(metadata, '$.width_mm')) AS INTEGER) || 'x' ||
            CAST(ROUND(json_extract(metadata, '$.height_mm')) AS INTEGER) || 'mm'
         FROM files
         WHERE project_id = ?1 AND favorited = 1
           AND json_extract(metadata, '$.width_mm') IS NOT NULL
           AND json_extract(metadata, '$.height_mm') IS NOT NULL
         LIMIT 1"
    )?;
    let mut rows = stmt.query_map(rusqlite::params![project_id], |row| row.get::<_, String>(0))?;
    match rows.next() {
        Some(Ok(size)) => Ok(Some(size)),
        _ => Ok(None),
    }
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

use rusqlite::Connection;
