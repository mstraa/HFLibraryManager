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

fn file_modified_time(path: &Path) -> String {
    fs::metadata(path)
        .and_then(|m| m.modified())
        .map(|t| {
            let dt: chrono::DateTime<Utc> = t.into();
            dt.to_rfc3339()
        })
        .unwrap_or_else(|_| Utc::now().to_rfc3339())
}

fn map_err<E: std::fmt::Display>(e: E) -> String {
    e.to_string()
}

/// Validate a filename is safe (no path traversal, no empty).
fn is_safe_filename(name: &str) -> bool {
    !name.is_empty()
        && !name.contains('/')
        && !name.contains('\\')
        && !name.contains("..")
        && name != "."
        && name != ".."
        && name.len() <= 255
}

/// Max file size for reading into memory (500 MB).
const MAX_FILE_SIZE: u64 = 500 * 1024 * 1024;

// ── Projects ──

#[tauri::command]
pub fn create_project(db: State<Database>, req: CreateProjectRequest) -> CmdResult<Project> {
    let conn = db.conn();
    let conn = conn.as_ref().ok_or("Database not available — check your library path")?;
    let id = Uuid::new_v4().to_string();
    let now = Utc::now().to_rfc3339();
    let description = req.description.unwrap_or_default();

    conn.execute(
        "INSERT INTO projects (id, name, description, created_at, updated_at) VALUES (?1, ?2, ?3, ?4, ?5)",
        rusqlite::params![id, req.name, description, now, now],
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
        thumbnail_path: None,
        created_at: now.clone(),
        updated_at: now,
        tags: vec![],
        collections: vec![],
        print_width_mm: None,
        print_height_mm: None,
        print_time_mins: None,
    })
}

#[tauri::command]
pub fn get_project(db: State<Database>, id: String) -> CmdResult<Project> {
    let conn = db.conn();
    let conn = conn.as_ref().ok_or("Database not available — check your library path")?;

    let mut stmt = conn.prepare(
        "SELECT id, name, description, thumbnail_path, created_at, updated_at, print_width_mm, print_height_mm, print_time_mins FROM projects WHERE id = ?1"
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
            print_width_mm: row.get(6)?,
            print_height_mm: row.get(7)?,
            print_time_mins: row.get(8)?,
        })
    }).map_err(map_err)?;

    let tags = get_project_tags(&conn, &project.id).map_err(map_err)?;
    let collections = get_project_collections(&conn, &project.id).map_err(map_err)?;

    Ok(Project { tags, collections, ..project })
}

#[tauri::command]
pub fn update_project(db: State<Database>, id: String, req: UpdateProjectRequest) -> CmdResult<()> {
    let conn = db.conn();
    let conn = conn.as_ref().ok_or("Database not available — check your library path")?;
    let now = Utc::now().to_rfc3339();

    if let Some(name) = &req.name {
        conn.execute("UPDATE projects SET name = ?1, updated_at = ?2 WHERE id = ?3",
            rusqlite::params![name, now, id]).map_err(map_err)?;
    }
    if let Some(description) = &req.description {
        conn.execute("UPDATE projects SET description = ?1, updated_at = ?2 WHERE id = ?3",
            rusqlite::params![description, now, id]).map_err(map_err)?;
    }
    if let Some(w) = &req.print_width_mm {
        conn.execute("UPDATE projects SET print_width_mm = ?1, updated_at = ?2 WHERE id = ?3",
            rusqlite::params![w, now, id]).map_err(map_err)?;
    }
    if let Some(h) = &req.print_height_mm {
        conn.execute("UPDATE projects SET print_height_mm = ?1, updated_at = ?2 WHERE id = ?3",
            rusqlite::params![h, now, id]).map_err(map_err)?;
    }
    if let Some(t) = &req.print_time_mins {
        conn.execute("UPDATE projects SET print_time_mins = ?1, updated_at = ?2 WHERE id = ?3",
            rusqlite::params![t, now, id]).map_err(map_err)?;
    }
    Ok(())
}

#[tauri::command]
pub fn delete_project(db: State<Database>, id: String) -> CmdResult<()> {
    let conn = db.conn();
    let conn = conn.as_ref().ok_or("Database not available — check your library path")?;
    conn.execute("DELETE FROM projects WHERE id = ?1", rusqlite::params![id]).map_err(map_err)?;

    // Move project folder to deleted/
    let project_dir = Database::data_dir().join("projects").join(&id);
    if project_dir.exists() {
        let trash_dir = Database::data_dir().join("deleted").join("projects").join(&id);
        fs::create_dir_all(trash_dir.parent().unwrap()).map_err(map_err)?;
        // If a previously deleted project with same id exists, remove it first
        if trash_dir.exists() {
            fs::remove_dir_all(&trash_dir).ok();
        }
        fs::rename(&project_dir, &trash_dir).map_err(map_err)?;
    }

    Ok(())
}

#[tauri::command]
pub fn duplicate_project(db: State<Database>, id: String) -> CmdResult<Project> {
    let conn = db.conn();
    let conn = conn.as_ref().ok_or("Database not available — check your library path")?;
    let new_id = Uuid::new_v4().to_string();
    let now = Utc::now().to_rfc3339();

    // Get source project
    let (name, description, pw, ph, pt): (String, String, Option<f64>, Option<f64>, Option<i64>) = conn.query_row(
        "SELECT name, description, print_width_mm, print_height_mm, print_time_mins FROM projects WHERE id = ?1",
        rusqlite::params![id],
        |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?, row.get(3)?, row.get(4)?)),
    ).map_err(map_err)?;

    let new_name = format!("{} (Copy)", name);

    // Create new project
    conn.execute(
        "INSERT INTO projects (id, name, description, print_width_mm, print_height_mm, print_time_mins, created_at, updated_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)",
        rusqlite::params![new_id, new_name, description, pw, ph, pt, now, now],
    ).map_err(map_err)?;

    // Create project directories
    let new_project_dir = Database::data_dir().join("projects").join(&new_id);
    let new_files_dir = new_project_dir.join("files");
    let new_thumb_dir = new_project_dir.join("thumbnails");
    fs::create_dir_all(&new_files_dir).map_err(map_err)?;
    fs::create_dir_all(&new_thumb_dir).map_err(map_err)?;

    // Copy files
    let mut stmt = conn.prepare(
        "SELECT id, file_path, original_filename, file_size, notes, thumbnail_path, favorited, metadata, created_at, modified_at FROM files WHERE project_id = ?1"
    ).map_err(map_err)?;
    let files: Vec<(String, String, String, i64, String, Option<String>, bool, String, String, String)> = stmt.query_map(
        rusqlite::params![id],
        |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?, row.get(3)?, row.get(4)?, row.get(5)?, row.get(6)?, row.get(7)?, row.get(8)?, row.get(9)?)),
    ).map_err(map_err)?
    .filter_map(|r| r.ok())
    .collect();

    for (_old_file_id, file_path, filename, file_size, notes, thumb_path, favorited, metadata, created_at, modified_at) in &files {
        let new_file_id = Uuid::new_v4().to_string();
        let src = Path::new(file_path);
        let dest = new_files_dir.join(filename);

        // Copy file on disk
        if src.exists() {
            if let Err(e) = fs::copy(src, &dest) {
                eprintln!("Warning: failed to copy file {:?}: {}", src, e);
            }
        }

        // Copy thumbnail if exists
        let new_thumb = if let Some(tp) = thumb_path {
            let src_thumb = Path::new(tp);
            if src_thumb.exists() {
                let thumb_name = format!("file_{}.png", new_file_id);
                let dest_thumb = new_thumb_dir.join(&thumb_name);
                if let Err(e) = fs::copy(src_thumb, &dest_thumb) {
                    eprintln!("Warning: failed to copy thumbnail {:?}: {}", src_thumb, e);
                }
                Some(dest_thumb.to_string_lossy().to_string())
            } else {
                None
            }
        } else {
            None
        };

        conn.execute(
            "INSERT INTO files (id, project_id, file_path, original_filename, file_size, notes, thumbnail_path, favorited, metadata, created_at, modified_at)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11)",
            rusqlite::params![new_file_id, new_id, dest.to_string_lossy().to_string(), filename, file_size, notes, new_thumb, favorited, metadata, created_at, modified_at],
        ).map_err(map_err)?;
    }

    // Copy project thumbnail
    let src_cover = Database::data_dir().join("projects").join(&id).join("thumbnails").join("cover.png");
    let src_cover_svg = Database::data_dir().join("projects").join(&id).join("thumbnails").join("cover.svg");
    let new_thumb_path = if src_cover.exists() {
        let dest = new_thumb_dir.join("cover.png");
        if let Err(e) = fs::copy(&src_cover, &dest) {
            eprintln!("Warning: failed to copy cover thumbnail: {}", e);
        }
        Some(dest.to_string_lossy().to_string())
    } else if src_cover_svg.exists() {
        let dest = new_thumb_dir.join("cover.svg");
        if let Err(e) = fs::copy(&src_cover_svg, &dest) {
            eprintln!("Warning: failed to copy cover SVG: {}", e);
        }
        Some(dest.to_string_lossy().to_string())
    } else {
        None
    };

    if let Some(ref tp) = new_thumb_path {
        conn.execute(
            "UPDATE projects SET thumbnail_path = ?1 WHERE id = ?2",
            rusqlite::params![tp, new_id],
        ).map_err(map_err)?;
    }

    // Copy tags
    conn.execute(
        "INSERT INTO project_tags (project_id, tag_id) SELECT ?1, tag_id FROM project_tags WHERE project_id = ?2",
        rusqlite::params![new_id, id],
    ).map_err(map_err)?;

    // Copy collections
    conn.execute(
        "INSERT INTO project_collections (project_id, collection_id) SELECT ?1, collection_id FROM project_collections WHERE project_id = ?2",
        rusqlite::params![new_id, id],
    ).map_err(map_err)?;

    let tags = get_project_tags(&conn, &new_id).map_err(map_err)?;
    let collections = get_project_collections(&conn, &new_id).map_err(map_err)?;

    Ok(Project {
        id: new_id,
        name: new_name,
        description,
        thumbnail_path: new_thumb_path,
        created_at: now.clone(),
        updated_at: now,
        tags,
        collections,
        print_width_mm: pw,
        print_height_mm: ph,
        print_time_mins: pt,
    })
}

#[tauri::command]
pub fn list_projects(db: State<Database>, req: ListProjectsRequest) -> CmdResult<Vec<ProjectSummary>> {
    let conn = db.conn();
    let conn = conn.as_ref().ok_or("Database not available — check your library path")?;

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

    // Filter by curated filament IDs — AND logic
    if let Some(filament_ids) = &req.filament_ids {
        for fid in filament_ids {
            conditions.push(format!(
                "p.id IN (SELECT pf.project_id FROM project_filaments pf WHERE pf.curated_filament_id = ?{})",
                param_idx
            ));
            params.push(Box::new(fid.clone()));
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

    // Exclude tags (NOT IN — project must NOT have any of the excluded tags)
    if let Some(exclude_tag_ids) = &req.exclude_tag_ids {
        for tag_id in exclude_tag_ids {
            conditions.push(format!(
                "p.id NOT IN (SELECT project_id FROM project_tags WHERE tag_id = ?{})",
                param_idx
            ));
            params.push(Box::new(tag_id.clone()));
            param_idx += 1;
        }
    }

    // Exclude filaments by curated IDs
    if let Some(exclude_filament_ids) = &req.exclude_filament_ids {
        for fid in exclude_filament_ids {
            conditions.push(format!(
                "p.id NOT IN (SELECT pf.project_id FROM project_filaments pf WHERE pf.curated_filament_id = ?{})",
                param_idx
            ));
            params.push(Box::new(fid.clone()));
            param_idx += 1;
        }
    }

    // Exclude sizes
    if let Some(exclude_sizes) = &req.exclude_sizes {
        for size in exclude_sizes {
            conditions.push(format!(
                "p.id NOT IN (SELECT f.project_id FROM files f \
                 WHERE f.favorited = 1 \
                 AND CAST(ROUND(json_extract(f.metadata, '$.width_mm')) AS INTEGER) || 'x' || \
                     CAST(ROUND(json_extract(f.metadata, '$.height_mm')) AS INTEGER) || 'mm' = ?{})",
                param_idx
            ));
            params.push(Box::new(size.clone()));
            param_idx += 1;
        }
    }

    // No-filament filter: projects with no project_filaments
    if let Some(no_filament) = &req.no_filament {
        let no_filament_condition = "p.id NOT IN (SELECT DISTINCT pf.project_id FROM project_filaments pf)";
        match no_filament.as_str() {
            "include" => conditions.push(no_filament_condition.to_string()),
            "exclude" => conditions.push(format!("NOT ({})", no_filament_condition)),
            _ => {}
        }
    }

    // owned_only: show only projects where at least one filament is owned
    if req.owned_only.unwrap_or(false) {
        conditions.push(
            "p.id IN (SELECT pf.project_id FROM project_filaments pf \
             JOIN shared.curated_filaments cf ON pf.curated_filament_id = cf.id WHERE cf.owned = 1)".to_string()
        );
    }

    // all_owned: show only projects where ALL filaments are owned
    if req.all_owned.unwrap_or(false) {
        conditions.push(
            "p.id IN (SELECT pf.project_id FROM project_filaments pf) AND \
             p.id NOT IN (SELECT pf.project_id FROM project_filaments pf \
             LEFT JOIN shared.curated_filaments cf ON pf.curated_filament_id = cf.id \
             WHERE cf.id IS NULL OR cf.owned = 0)".to_string()
        );
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
        "SELECT p.id, p.name, p.thumbnail_path, p.created_at, p.updated_at,
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
            thumbnail_path: row.get(2)?,
            created_at: row.get(3)?,
            updated_at: row.get(4)?,
            tags: vec![],
            file_count: row.get(5)?,
            filaments: vec![],
            size: None,
        })
    }).map_err(map_err)?;

    let mut projects: Vec<ProjectSummary> = Vec::new();
    for row in rows {
        projects.push(row.map_err(map_err)?);
    }

    if projects.is_empty() {
        return Ok(projects);
    }

    // Batch-fetch tags for all projects in one query
    {
        let mut tag_stmt = conn.prepare(
            "SELECT pt.project_id, t.id, t.name, t.color FROM tags t
             INNER JOIN project_tags pt ON t.id = pt.tag_id ORDER BY t.name"
        ).map_err(map_err)?;
        let tag_rows = tag_stmt.query_map([], |row| {
            Ok((row.get::<_, String>(0)?, Tag { id: row.get(1)?, name: row.get(2)?, color: row.get(3)? }))
        }).map_err(map_err)?;
        let mut tags_by_project: std::collections::HashMap<String, Vec<Tag>> = std::collections::HashMap::new();
        for row in tag_rows {
            if let Ok((pid, tag)) = row {
                tags_by_project.entry(pid).or_default().push(tag);
            }
        }
        for p in &mut projects {
            if let Some(tags) = tags_by_project.remove(&p.id) {
                p.tags = tags;
            }
        }
    }

    // Batch-fetch filaments for all projects in one query
    {
        let mut pf_stmt = conn.prepare(
            "SELECT pf.project_id, pf.id, pf.curated_filament_id, pf.parsed_color, pf.parsed_brand, pf.parsed_name, pf.parsed_td, pf.match_status,
                    cf.brand, cf.line, cf.material, cf.name, cf.color, cf.transmission_distance, cf.owned, pf.is_manual
             FROM project_filaments pf
             LEFT JOIN shared.curated_filaments cf ON pf.curated_filament_id = cf.id
             ORDER BY COALESCE(cf.brand, pf.parsed_brand), COALESCE(cf.name, pf.parsed_name)"
        ).map_err(map_err)?;
        let pf_rows = pf_stmt.query_map([], |row| {
            let project_id: String = row.get(0)?;
            let curated_id: Option<String> = row.get(2)?;
            let has_curated = curated_id.is_some();
            Ok((project_id, ProjectFilamentDisplay {
                project_filament_id: row.get(1)?,
                curated_filament_id: curated_id,
                parsed_color: row.get(3)?,
                parsed_brand: row.get(4)?,
                parsed_name: row.get(5)?,
                parsed_td: row.get(6)?,
                match_status: row.get(7)?,
                brand: if has_curated { row.get::<_, String>(8).unwrap_or_default() } else { row.get::<_, String>(4).unwrap_or_default() },
                line: if has_curated { row.get::<_, String>(9).unwrap_or_default() } else { String::new() },
                material: if has_curated { row.get::<_, String>(10).unwrap_or_default() } else { String::from("PLA") },
                name: if has_curated { row.get::<_, String>(11).unwrap_or_default() } else { row.get::<_, String>(5).unwrap_or_default() },
                color: if has_curated { row.get::<_, String>(12).unwrap_or_default() } else { row.get::<_, String>(3).unwrap_or_default() },
                td: if has_curated { row.get(13)? } else { row.get(6)? },
                owned: if has_curated { row.get::<_, i32>(14).unwrap_or(0) != 0 } else { false },
                is_manual: row.get::<_, i32>(15).unwrap_or(0) != 0,
            }))
        }).map_err(map_err)?;

        let mut filaments_by_project: std::collections::HashMap<String, Vec<ProjectFilamentDisplay>> = std::collections::HashMap::new();
        for row in pf_rows {
            if let Ok((pid, pf)) = row {
                filaments_by_project.entry(pid).or_default().push(pf);
            }
        }

        // Deduplicate filaments per project
        for p in &mut projects {
            if let Some(all) = filaments_by_project.remove(&p.id) {
                let mut seen = std::collections::HashSet::new();
                for pf in all {
                    let key = if let Some(ref cid) = pf.curated_filament_id {
                        cid.clone()
                    } else {
                        format!("{}|{}|{}", pf.parsed_color.to_lowercase(), pf.parsed_brand, pf.parsed_name)
                    };
                    if seen.insert(key) {
                        p.filaments.push(pf);
                    }
                }
            }
        }
    }

    // Batch-fetch sizes for all projects in one query
    {
        let mut size_stmt = conn.prepare(
            "SELECT project_id,
                    CAST(ROUND(json_extract(metadata, '$.width_mm')) AS INTEGER) || 'x' ||
                    CAST(ROUND(json_extract(metadata, '$.height_mm')) AS INTEGER) || 'mm'
             FROM files
             WHERE favorited = 1
               AND json_extract(metadata, '$.width_mm') IS NOT NULL
               AND json_extract(metadata, '$.height_mm') IS NOT NULL"
        ).map_err(map_err)?;
        let size_rows = size_stmt.query_map([], |row| {
            Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?))
        }).map_err(map_err)?;
        let mut sizes_by_project: std::collections::HashMap<String, String> = std::collections::HashMap::new();
        for row in size_rows {
            if let Ok((pid, size)) = row {
                sizes_by_project.entry(pid).or_insert(size);
            }
        }
        for p in &mut projects {
            p.size = sizes_by_project.remove(&p.id);
        }
    }

    Ok(projects)
}

// ── Tags ──

#[tauri::command]
pub fn create_tag(db: State<Database>, req: CreateTagRequest) -> CmdResult<Tag> {
    let conn = db.conn();
    let conn = conn.as_ref().ok_or("Database not available — check your library path")?;
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
    let conn = db.conn();
    let conn = conn.as_ref().ok_or("Database not available — check your library path")?;
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
    let conn = db.conn();
    let conn = conn.as_ref().ok_or("Database not available — check your library path")?;
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
    let conn = db.conn();
    let conn = conn.as_ref().ok_or("Database not available — check your library path")?;
    conn.execute("DELETE FROM tags WHERE id = ?1", rusqlite::params![id]).map_err(map_err)?;
    Ok(())
}

#[tauri::command]
pub fn set_project_tags(db: State<Database>, project_id: String, tag_ids: Vec<String>) -> CmdResult<()> {
    let conn = db.conn();
    let conn = conn.as_ref().ok_or("Database not available — check your library path")?;
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
    let conn = db.conn();
    let conn = conn.as_ref().ok_or("Database not available — check your library path")?;
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
    let conn = db.conn();
    let conn = conn.as_ref().ok_or("Database not available — check your library path")?;
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
    let conn = db.conn();
    let conn = conn.as_ref().ok_or("Database not available — check your library path")?;
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
    let conn = db.conn();
    let conn = conn.as_ref().ok_or("Database not available — check your library path")?;
    conn.execute("DELETE FROM collections WHERE id = ?1", rusqlite::params![id]).map_err(map_err)?;
    Ok(())
}

#[tauri::command]
pub fn add_project_to_collection(db: State<Database>, project_id: String, collection_id: String) -> CmdResult<()> {
    let conn = db.conn();
    let conn = conn.as_ref().ok_or("Database not available — check your library path")?;
    conn.execute(
        "INSERT OR IGNORE INTO project_collections (project_id, collection_id) VALUES (?1, ?2)",
        rusqlite::params![project_id, collection_id],
    ).map_err(map_err)?;
    Ok(())
}

#[tauri::command]
pub fn remove_project_from_collection(db: State<Database>, project_id: String, collection_id: String) -> CmdResult<()> {
    let conn = db.conn();
    let conn = conn.as_ref().ok_or("Database not available — check your library path")?;
    conn.execute(
        "DELETE FROM project_collections WHERE project_id = ?1 AND collection_id = ?2",
        rusqlite::params![project_id, collection_id],
    ).map_err(map_err)?;
    Ok(())
}

// ── Files ──

#[tauri::command]
pub fn get_project_files(db: State<Database>, project_id: String) -> CmdResult<Vec<ProjectFile>> {
    let conn = db.conn();
    let conn = conn.as_ref().ok_or("Database not available — check your library path")?;

    let mut stmt = conn.prepare(
        "SELECT id, project_id, file_path, original_filename, file_size, notes, thumbnail_path, favorited, metadata, created_at, modified_at
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
            modified_at: row.get(10)?,
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
    let conn = db.conn();
    let conn = conn.as_ref().ok_or("Database not available — check your library path")?;
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
        let source_modified = file_modified_time(source);
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
            "INSERT INTO files (id, project_id, file_path, original_filename, file_size, notes, thumbnail_path, created_at, modified_at)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)",
            rusqlite::params![file_id, project_id, dest_str, stored_filename, file_size, "", thumb_path, now, source_modified],
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
            modified_at: source_modified,
        });
    }

    // Update project timestamp
    conn.execute("UPDATE projects SET updated_at = ?1 WHERE id = ?2",
        rusqlite::params![now, project_id]).map_err(map_err)?;

    Ok(result)
}

#[tauri::command]
pub fn delete_file(db: State<Database>, file_id: String) -> CmdResult<()> {
    let conn = db.conn();
    let conn = conn.as_ref().ok_or("Database not available — check your library path")?;

    let (file_path, project_id): (String, String) = conn.query_row(
        "SELECT file_path, project_id FROM files WHERE id = ?1",
        rusqlite::params![file_id],
        |row| Ok((row.get(0)?, row.get(1)?)),
    ).map_err(map_err)?;

    conn.execute("DELETE FROM files WHERE id = ?1", rusqlite::params![file_id]).map_err(map_err)?;

    // Move file to deleted/ folder
    let path = Path::new(&file_path);
    if path.exists() {
        let filename = path.file_name().unwrap_or_default();
        let trash_dir = Database::data_dir().join("deleted").join("files").join(&project_id);
        if let Err(e) = fs::create_dir_all(&trash_dir) {
            eprintln!("Warning: failed to create trash dir: {}", e);
        }
        let dest = trash_dir.join(filename);
        // If same filename already in trash, add file_id suffix
        let dest = if dest.exists() {
            let stem = dest.file_stem().unwrap_or_default().to_string_lossy().to_string();
            let ext = dest.extension().map(|e| format!(".{}", e.to_string_lossy())).unwrap_or_default();
            trash_dir.join(format!("{}_{}{}", stem, &file_id[..8], ext))
        } else {
            dest
        };
        if let Err(e) = fs::rename(path, &dest) {
            eprintln!("Warning: failed to move file to trash: {}", e);
        }
    }

    // Also move thumbnail if it exists
    let thumb_path = Database::data_dir()
        .join("projects").join(&project_id).join("thumbnails")
        .join(format!("file_{}.png", file_id));
    if thumb_path.exists() {
        let trash_thumb_dir = Database::data_dir().join("deleted").join("files").join(&project_id);
        if let Err(e) = fs::create_dir_all(&trash_thumb_dir) {
            eprintln!("Warning: failed to create thumbnail trash dir: {}", e);
        }
        if let Err(e) = fs::rename(&thumb_path, trash_thumb_dir.join(format!("file_{}.png", file_id))) {
            eprintln!("Warning: failed to move thumbnail to trash: {}", e);
        }
    }

    Ok(())
}

#[tauri::command]
pub fn update_file_notes(db: State<Database>, file_id: String, notes: String) -> CmdResult<()> {
    let conn = db.conn();
    let conn = conn.as_ref().ok_or("Database not available — check your library path")?;
    conn.execute(
        "UPDATE files SET notes = ?1 WHERE id = ?2",
        rusqlite::params![notes, file_id],
    ).map_err(map_err)?;
    Ok(())
}

#[tauri::command]
pub fn toggle_file_favorite(db: State<Database>, file_id: String) -> CmdResult<bool> {
    let conn = db.conn();
    let conn = conn.as_ref().ok_or("Database not available — check your library path")?;
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

        // Get project_id for this file
        let project_id: String = conn.query_row(
            "SELECT project_id FROM files WHERE id = ?1",
            rusqlite::params![file_id],
            |row| row.get(0),
        ).map_err(map_err)?;

        let ext = filename.rsplit('.').next().unwrap_or("").to_lowercase();
        let is_3mf = ext == "3mf";
        let is_hfp_or_txt = ext == "hfp" || ext == "txt";

        // Insert project_filaments and run matching
        if let Some(ref filaments) = metadata.filaments {
            if !filaments.is_empty() {
                let mut should_add = true;

                if is_3mf {
                    // Only add 3mf filaments if no hfp/txt filaments exist for this project
                    let has_hfp_txt_filaments: bool = conn.query_row(
                        "SELECT EXISTS(SELECT 1 FROM project_filaments pf
                         JOIN files f ON pf.file_id = f.id
                         WHERE pf.project_id = ?1 AND pf.is_manual = 0
                         AND (LOWER(f.original_filename) LIKE '%.hfp' OR LOWER(f.original_filename) LIKE '%.txt'))",
                        rusqlite::params![project_id],
                        |row| row.get(0),
                    ).unwrap_or(false);
                    if has_hfp_txt_filaments {
                        should_add = false;
                    }
                }

                if is_hfp_or_txt {
                    // Remove any 3mf-sourced filaments from this project
                    conn.execute(
                        "DELETE FROM project_filaments WHERE project_id = ?1 AND is_manual = 0
                         AND file_id IN (SELECT id FROM files WHERE project_id = ?1 AND LOWER(original_filename) LIKE '%.3mf')",
                        rusqlite::params![project_id],
                    ).map_err(map_err)?;
                }

                if should_add {
                    for f in filaments {
                        let pf_id = Uuid::new_v4().to_string();
                        conn.execute(
                            "INSERT INTO project_filaments (id, project_id, file_id, parsed_color, parsed_brand, parsed_name, match_status)
                             VALUES (?1, ?2, ?3, ?4, ?5, ?6, 'unmatched')",
                            rusqlite::params![pf_id, project_id, file_id, f.color, f.brand, f.name],
                        ).map_err(map_err)?;

                        if let Some((curated_id, status)) = Database::find_match(conn, &f.color, &f.brand, &f.name).map_err(map_err)? {
                            conn.execute(
                                "UPDATE project_filaments SET curated_filament_id = ?1, match_status = ?2 WHERE id = ?3",
                                rusqlite::params![curated_id, status, pf_id],
                            ).map_err(map_err)?;
                        }
                    }
                }
            }
        }

    } else {
        conn.execute(
            "UPDATE files SET favorited = 0, metadata = '{}' WHERE id = ?1",
            rusqlite::params![file_id],
        ).map_err(map_err)?;
        // Remove project_filaments for this file
        conn.execute(
            "DELETE FROM project_filaments WHERE file_id = ?1",
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
        "3mf" => parse_3mf(file_path),
        _ => FileMetadata::default(),
    }
}

/// Extract (brand, name) from a filament description string like:
/// "PLA BambuLab Basic Red  Transmission Distance: 4"
/// Returns e.g. ("BambuLab Basic", "Red")
fn parse_filament_name(s: &str) -> (String, String) {
    // Strip everything from "Transmission Distance" or "— TD:" / "TD:" onward
    let name_part = if let Some(idx) = s.find("Transmission Distance") {
        s[..idx].trim()
    } else if let Some(idx) = s.find("\u{2014} TD:") {  // em-dash
        s[..idx].trim()
    } else if let Some(idx) = s.find("\u{2013} TD:") {  // en-dash
        s[..idx].trim()
    } else if let Some(idx) = s.find("- TD:") {
        s[..idx].trim()
    } else if let Some(idx) = s.find("(TD:") {
        s[..idx].trim()
    } else if let Some(idx) = s.find("TD:") {
        s[..idx].trim()
    } else {
        s.trim()
    };

    let parts: Vec<&str> = name_part.split_whitespace().collect();
    // Expected format: TYPE BRAND1 BRAND2 COLOR...
    // e.g. "PLA BambuLab Basic Red" → brand="BambuLab Basic", name="Red"
    if parts.len() >= 4 {
        let brand = format!("{} {}", parts[1], parts[2]);
        let color_name = parts[3..].join(" ");
        (brand, color_name)
    } else if parts.len() == 3 {
        (parts[1].to_string(), parts[2].to_string())
    } else if parts.len() == 2 {
        (parts[0].to_string(), parts[1].to_string())
    } else {
        (name_part.to_string(), name_part.to_string())
    }
}

/// Guess a hex color from a filament color name.
fn guess_color_hex(name: &str) -> String {
    let lower = name.to_lowercase();
    // Check each word in the name against known colors
    // Order: check full name first, then individual words
    let candidates = [
        (&lower as &str, true),
    ];
    for (text, _) in &candidates {
        let result = match *text {
            s if s.contains("black") => "#000000",
            s if s.contains("jade white") => "#e8e8e0",
            s if s.contains("white") => "#ffffff",
            s if s.contains("red") => "#cc0000",
            s if s.contains("blue") && s.contains("light") => "#6699cc",
            s if s.contains("blue") && s.contains("sky") => "#87ceeb",
            s if s.contains("blue") && s.contains("navy") => "#001f3f",
            s if s.contains("blue") && s.contains("royal") => "#4169e1",
            s if s.contains("blue") => "#0055cc",
            s if s.contains("green") && s.contains("light") => "#66cc66",
            s if s.contains("green") && s.contains("dark") => "#006600",
            s if s.contains("green") && s.contains("olive") => "#808000",
            s if s.contains("green") => "#009933",
            s if s.contains("yellow") => "#ffcc00",
            s if s.contains("orange") => "#ff6600",
            s if s.contains("purple") => "#8833aa",
            s if s.contains("violet") => "#7733bb",
            s if s.contains("pink") && s.contains("hot") => "#ff1493",
            s if s.contains("pink") => "#ff69b4",
            s if s.contains("magenta") => "#cc00cc",
            s if s.contains("cyan") => "#00cccc",
            s if s.contains("teal") => "#008080",
            s if s.contains("brown") => "#8b4513",
            s if s.contains("tan") => "#d2b48c",
            s if s.contains("beige") => "#f5f5dc",
            s if s.contains("cream") => "#fffdd0",
            s if s.contains("ivory") => "#fffff0",
            s if s.contains("gold") => "#ffd700",
            s if s.contains("silver") => "#c0c0c0",
            s if s.contains("gray") || s.contains("grey") => "#808080",
            s if s.contains("charcoal") => "#333333",
            s if s.contains("coral") => "#ff7f50",
            s if s.contains("salmon") => "#fa8072",
            s if s.contains("maroon") => "#800000",
            s if s.contains("burgundy") => "#800020",
            s if s.contains("crimson") => "#dc143c",
            s if s.contains("scarlet") => "#ff2400",
            s if s.contains("jade") => "#00a86b",
            s if s.contains("mint") => "#98ff98",
            s if s.contains("lavender") => "#b57edc",
            s if s.contains("lilac") => "#c8a2c8",
            s if s.contains("peach") => "#ffcba4",
            s if s.contains("rust") => "#b7410e",
            s if s.contains("copper") => "#b87333",
            s if s.contains("bronze") => "#cd7f32",
            s if s.contains("khaki") => "#c3b091",
            s if s.contains("indigo") => "#4b0082",
            s if s.contains("turquoise") => "#40e0d0",
            s if s.contains("aqua") => "#00ffff",
            s if s.contains("plum") => "#8e4585",
            s if s.contains("olive") => "#808000",
            s if s.contains("sand") => "#c2b280",
            s if s.contains("lemon") => "#fff44f",
            s if s.contains("lime") => "#32cd32",
            s if s.contains("forest") => "#228b22",
            s if s.contains("sky") => "#87ceeb",
            s if s.contains("cobalt") => "#0047ab",
            s if s.contains("sapphire") => "#0f52ba",
            s if s.contains("ruby") => "#e0115f",
            s if s.contains("emerald") => "#50c878",
            s if s.contains("bamboo") => "#d4a017",
            _ => "",
        };
        if !result.is_empty() {
            return result.to_string();
        }
    }
    String::new()
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
    let mut in_filaments_section = false;

    for line in content.lines() {
        let trimmed = line.trim();

        // Track filaments section
        if trimmed.starts_with("Filaments Used") || trimmed.starts_with("Filaments:") {
            in_filaments_section = true;
            // Extract count from "Filaments Used (4 total):"
            if trimmed.contains("total") {
                if let Some(num) = trimmed.split_whitespace()
                    .find_map(|w| w.trim_start_matches('(').parse::<i32>().ok()) {
                    filament_count = Some(num);
                }
            }
            continue;
        }
        // Exit filaments section on new section header (but not on blank lines, to handle
        // formats with blank lines between filament entries)
        if in_filaments_section && !trimmed.is_empty() {
            let is_section_header = trimmed.ends_with(':') && !trimmed.contains("TD:");
            if is_section_header || trimmed.starts_with("Swap ") {
                in_filaments_section = false;
            }
        }

        // Parse filament lines with hex: "#c00d1e PLA BambuLab Basic Red  Transmission Distance: 4"
        if trimmed.starts_with('#') && trimmed.len() > 7 {
            let hex = &trimmed[..7];
            if hex.len() == 7 && hex[1..].chars().all(|c| c.is_ascii_hexdigit()) {
                let rest = trimmed[7..].trim();
                // Strip owned marker "* " if present
                let rest = rest.strip_prefix("* ").unwrap_or(rest).trim();
                let (brand, name) = parse_filament_name(rest);
                if !filaments.iter().any(|f| f.color == hex && f.name == name) {
                    filaments.push(FilamentInfo {
                        color: hex.to_string(),
                        name,
                        brand,
                    });
                }
            }
        }
        // Parse filament lines without hex (older format):
        // "PLA BambuLab Basic Black Transmission Distance: 0.2"
        // "PLA BambuLab Basic Black — TD: 0.6"
        else if in_filaments_section && (trimmed.contains("Transmission Distance") || trimmed.contains("TD:")) {
            let (brand, name) = parse_filament_name(trimmed);
            if !name.is_empty() && !filaments.iter().any(|f| f.name == name && f.brand == brand) {
                let color = guess_color_hex(&name);
                filaments.push(FilamentInfo {
                    color,
                    name,
                    brand,
                });
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

/// Parse a .3mf file (ZIP archive) to extract filament info and model size.
/// Reads Metadata/project_settings.config (JSON) for filaments and layer height,
/// and Metadata/plate_*.json for model bounding box dimensions.
fn parse_3mf(file_path: &str) -> FileMetadata {
    let file = match fs::File::open(file_path) {
        Ok(f) => f,
        Err(_) => return FileMetadata::default(),
    };
    let mut archive = match zip::ZipArchive::new(file) {
        Ok(a) => a,
        Err(_) => return FileMetadata::default(),
    };

    let mut filaments: Vec<FilamentInfo> = Vec::new();
    let mut layer_height = None;
    let mut width_mm = None;
    let mut height_mm = None;

    // Parse project_settings.config for filament data
    if let Ok(entry) = archive.by_name("Metadata/project_settings.config") {
        if let Ok(settings) = serde_json::from_reader::<_, serde_json::Value>(entry) {
            let colours = settings.get("filament_colour").and_then(|v| v.as_array());
            let types = settings.get("filament_type").and_then(|v| v.as_array());
            let vendors = settings.get("filament_vendor").and_then(|v| v.as_array());
            let settings_ids = settings.get("filament_settings_id").and_then(|v| v.as_array());

            if let Some(lh) = settings.get("layer_height").and_then(|v| v.as_f64()) {
                layer_height = Some(lh);
            }

            if let Some(colours) = colours {
                for (i, colour_val) in colours.iter().enumerate() {
                    let color = colour_val.as_str().unwrap_or("").to_string();
                    if color.is_empty() { continue; }

                    let material = types.and_then(|a| a.get(i))
                        .and_then(|v| v.as_str()).unwrap_or("").to_string();
                    let vendor = vendors.and_then(|a| a.get(i))
                        .and_then(|v| v.as_str()).unwrap_or("").to_string();

                    // Extract brand+line from filament_settings_id like "Bambu PLA Basic @BBL X1C"
                    // Format: "<brand> <material> <line> @<printer>"
                    let settings_id = settings_ids.and_then(|a| a.get(i))
                        .and_then(|v| v.as_str()).unwrap_or("");

                    let (_brand, line) = parse_3mf_settings_id(settings_id, &vendor, &material);

                    // Use vendor for brand (e.g. "Bambu Lab") and extracted line (e.g. "Basic")
                    // The parsed_name will just be the color hex since 3mf doesn't have color names
                    let full_brand = if line.is_empty() {
                        vendor.clone()
                    } else {
                        format!("{} {}", vendor, line)
                    };
                    let name = color.clone();

                    if !filaments.iter().any(|f| f.color == color) {
                        filaments.push(FilamentInfo {
                            color,
                            name,
                            brand: full_brand,
                        });
                    }
                }
            }
        }
    }

    // Parse plate JSON for model bounding box
    for i in 0..archive.len() {
        let entry_name = match archive.by_index(i) {
            Ok(e) => e.name().to_string(),
            Err(_) => continue,
        };
        if entry_name.starts_with("Metadata/plate_") && entry_name.ends_with(".json") {
            if let Ok(entry) = archive.by_name(&entry_name) {
                if let Ok(plate) = serde_json::from_reader::<_, serde_json::Value>(entry) {
                    if let Some(bbox) = plate.get("bbox_all").and_then(|v| v.as_array()) {
                        if bbox.len() == 4 {
                            let x_min = bbox[0].as_f64().unwrap_or(0.0);
                            let y_min = bbox[1].as_f64().unwrap_or(0.0);
                            let x_max = bbox[2].as_f64().unwrap_or(0.0);
                            let y_max = bbox[3].as_f64().unwrap_or(0.0);
                            let w = (x_max - x_min).round();
                            let h = (y_max - y_min).round();
                            if w > 0.0 { width_mm = Some(w); }
                            if h > 0.0 { height_mm = Some(h); }
                        }
                    }
                }
            }
            break; // Only need the first plate
        }
    }

    FileMetadata {
        filament_count: if filaments.is_empty() { None } else { Some(filaments.len() as i32) },
        filaments: if filaments.is_empty() { None } else { Some(filaments) },
        width_mm,
        height_mm,
        layer_height,
        max_thickness: None,
    }
}

/// Parse filament_settings_id like "Bambu PLA Basic @BBL X1C" to extract (brand, line).
/// Falls back to vendor name if settings_id can't be parsed.
fn parse_3mf_settings_id(settings_id: &str, vendor: &str, material: &str) -> (String, String) {
    // Strip everything after " @" (printer identifier)
    let base = settings_id.split(" @").next().unwrap_or(settings_id).trim();

    if base.is_empty() {
        return (vendor.to_string(), String::new());
    }

    // base is like "Bambu PLA Basic" — strip material to get "Bambu Basic"
    // But material might appear anywhere, so split into words and remove the material word
    let mat_lower = material.to_lowercase();
    let words: Vec<&str> = base.split_whitespace().collect();
    let filtered: Vec<&str> = words.iter()
        .filter(|w| w.to_lowercase() != mat_lower)
        .copied()
        .collect();

    if filtered.len() >= 2 {
        // First word is brand, rest is line
        (filtered[0].to_string(), filtered[1..].join(" "))
    } else if filtered.len() == 1 {
        (filtered[0].to_string(), String::new())
    } else {
        (vendor.to_string(), String::new())
    }
}

#[tauri::command]
pub fn set_project_thumbnail(db: State<Database>, project_id: String, source_path: String) -> CmdResult<String> {
    let conn = db.conn();
    let conn = conn.as_ref().ok_or("Database not available — check your library path")?;

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
    // Canonicalize to prevent path traversal
    let canonical = dir.canonicalize().map_err(map_err)?;
    let mut files: Vec<String> = Vec::new();
    for entry in fs::read_dir(&canonical).map_err(map_err)?.flatten() {
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
pub fn open_file_with_app(path: String, app: String) -> CmdResult<()> {
    // Validate app against whitelist
    const ALLOWED_APPS: &[&str] = &[
        "BambuStudio",
        "HueForge",
        "Affinity Designer 2",
        "Affinity Photo 2",
        "Affinity Publisher 2",
    ];
    if !ALLOWED_APPS.iter().any(|a| *a == app) {
        return Err(format!("Application '{}' is not in the allowed list", app));
    }
    // Validate path exists
    if !Path::new(&path).is_file() {
        return Err("File does not exist".to_string());
    }

    #[cfg(target_os = "macos")]
    {
        std::process::Command::new("open")
            .arg("-a")
            .arg(&app)
            .arg(&path)
            .spawn()
            .map_err(map_err)?;
    }

    #[cfg(target_os = "windows")]
    {
        // On Windows, try to launch the app executable directly with the file as argument
        std::process::Command::new("cmd")
            .args(["/C", "start", "", &app, &path])
            .spawn()
            .map_err(map_err)?;
    }

    #[cfg(target_os = "linux")]
    {
        // On Linux, try launching the app binary (lowercase) with the file as argument
        let app_lower = app.to_lowercase().replace(' ', "");
        std::process::Command::new(&app_lower)
            .arg(&path)
            .spawn()
            .map_err(|_| format!("Could not launch '{}'. Make sure it is installed and in PATH.", app))?;
    }

    Ok(())
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
    let conn = db.conn();
    let conn = conn.as_ref().ok_or("Database not available — check your library path")?;
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

            let modified = file_modified_time(&path);
            conn.execute(
                "INSERT INTO files (id, project_id, file_path, original_filename, file_size, notes, thumbnail_path, created_at, modified_at)
                 VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)",
                rusqlite::params![file_id, project_id, file_path_str, filename, file_size, "", thumb_path, now, modified],
            ).map_err(map_err)?;
            added += 1;
        }
    }

    // 3. Re-parse metadata for favorited hfp/txt files (in case parsing logic changed)
    {
        let mut stmt = conn.prepare(
            "SELECT id, file_path, original_filename FROM files WHERE project_id = ?1 AND favorited = 1"
        ).map_err(map_err)?;
        let favorited: Vec<(String, String, String)> = stmt.query_map(rusqlite::params![project_id], |row| {
            Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?, row.get::<_, String>(2)?))
        }).map_err(map_err)?
        .filter_map(|r| r.ok())
        .collect();

        for (file_id, file_path, filename) in &favorited {
            let ext = filename.rsplit('.').next().unwrap_or("").to_lowercase();
            if ext == "hfp" || ext == "txt" {
                let metadata = parse_file_metadata(file_path, filename);
                let metadata_json = serde_json::to_string(&metadata).unwrap_or_else(|_| "{}".to_string());
                conn.execute(
                    "UPDATE files SET metadata = ?1 WHERE id = ?2",
                    rusqlite::params![metadata_json, file_id],
                ).map_err(map_err)?;
            }
        }
    }

    Ok(SyncResult { added, removed })
}

// ── Filament & Size Filters ──

#[tauri::command]
pub fn list_all_filaments(db: State<Database>) -> CmdResult<Vec<CuratedFilament>> {
    list_curated_filaments(db)
}

#[tauri::command]
pub fn list_all_sizes(db: State<Database>) -> CmdResult<Vec<String>> {
    let conn = db.conn();
    let conn = conn.as_ref().ok_or("Database not available — check your library path")?;
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

// ── Curated Filaments ──

#[tauri::command]
pub fn list_curated_filaments(db: State<Database>) -> CmdResult<Vec<CuratedFilament>> {
    let conn = db.conn();
    let conn = conn.as_ref().ok_or("Database not available — check your library path")?;
    let mut stmt = conn.prepare(
        "SELECT id, brand, line, material, name, color, transmission_distance, owned, source_uuid, created_at, updated_at
         FROM shared.curated_filaments ORDER BY brand, line, name"
    ).map_err(map_err)?;

    let rows = stmt.query_map([], |row| {
        Ok(CuratedFilament {
            id: row.get(0)?,
            brand: row.get(1)?,
            line: row.get(2)?,
            material: row.get(3)?,
            name: row.get(4)?,
            color: row.get(5)?,
            transmission_distance: row.get(6)?,
            owned: row.get::<_, i32>(7)? != 0,
            source_uuid: row.get(8)?,
            created_at: row.get(9)?,
            updated_at: row.get(10)?,
        })
    }).map_err(map_err)?;
    rows.collect::<Result<Vec<_>, _>>().map_err(map_err)
}

#[tauri::command]
pub fn list_used_curated_filaments(db: State<Database>) -> CmdResult<Vec<CuratedFilamentWithCount>> {
    let conn = db.conn();
    let conn = conn.as_ref().ok_or("Database not available — check your library path")?;
    let mut stmt = conn.prepare(
        "SELECT cf.id, cf.brand, cf.line, cf.material, cf.name, cf.color, cf.transmission_distance, cf.owned, cf.source_uuid, cf.created_at, cf.updated_at,
                COUNT(DISTINCT pf.project_id) as project_count
         FROM shared.curated_filaments cf
         INNER JOIN project_filaments pf ON pf.curated_filament_id = cf.id
         GROUP BY cf.id
         ORDER BY cf.brand, cf.line, cf.name"
    ).map_err(map_err)?;

    let rows = stmt.query_map([], |row| {
        Ok(CuratedFilamentWithCount {
            id: row.get(0)?,
            brand: row.get(1)?,
            line: row.get(2)?,
            material: row.get(3)?,
            name: row.get(4)?,
            color: row.get(5)?,
            transmission_distance: row.get(6)?,
            owned: row.get::<_, i32>(7)? != 0,
            source_uuid: row.get(8)?,
            created_at: row.get(9)?,
            updated_at: row.get(10)?,
            project_count: row.get(11)?,
        })
    }).map_err(map_err)?;
    rows.collect::<Result<Vec<_>, _>>().map_err(map_err)
}

#[tauri::command]
pub fn create_curated_filament(db: State<Database>, req: CreateCuratedFilamentRequest) -> CmdResult<CuratedFilament> {
    let conn = db.conn();
    let conn = conn.as_ref().ok_or("Database not available — check your library path")?;
    let id = Uuid::new_v4().to_string();
    let now = Utc::now().to_rfc3339();
    let line = req.line.unwrap_or_default();
    let material = req.material.unwrap_or_else(|| "PLA".to_string());
    let color = req.color.unwrap_or_default();
    let owned = req.owned.unwrap_or(false);

    conn.execute(
        "INSERT INTO shared.curated_filaments (id, brand, line, material, name, color, transmission_distance, owned, created_at, updated_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10)",
        rusqlite::params![
            id, req.brand, line, material, req.name, color, req.transmission_distance,
            if owned { 1 } else { 0 }, now, now
        ],
    ).map_err(map_err)?;

    Ok(CuratedFilament {
        id, brand: req.brand, line, material, name: req.name, color,
        transmission_distance: req.transmission_distance,
        owned, source_uuid: None,
        created_at: now.clone(), updated_at: now,
    })
}

#[tauri::command]
pub fn update_curated_filament(db: State<Database>, id: String, req: UpdateCuratedFilamentRequest) -> CmdResult<()> {
    let conn = db.conn();
    let conn = conn.as_ref().ok_or("Database not available — check your library path")?;
    let now = Utc::now().to_rfc3339();

    if let Some(brand) = &req.brand {
        conn.execute("UPDATE shared.curated_filaments SET brand = ?1, updated_at = ?2 WHERE id = ?3",
            rusqlite::params![brand, now, id]).map_err(map_err)?;
    }
    if let Some(line) = &req.line {
        conn.execute("UPDATE shared.curated_filaments SET line = ?1, updated_at = ?2 WHERE id = ?3",
            rusqlite::params![line, now, id]).map_err(map_err)?;
    }
    if let Some(material) = &req.material {
        conn.execute("UPDATE shared.curated_filaments SET material = ?1, updated_at = ?2 WHERE id = ?3",
            rusqlite::params![material, now, id]).map_err(map_err)?;
    }
    if let Some(name) = &req.name {
        conn.execute("UPDATE shared.curated_filaments SET name = ?1, updated_at = ?2 WHERE id = ?3",
            rusqlite::params![name, now, id]).map_err(map_err)?;
    }
    if let Some(color) = &req.color {
        conn.execute("UPDATE shared.curated_filaments SET color = ?1, updated_at = ?2 WHERE id = ?3",
            rusqlite::params![color, now, id]).map_err(map_err)?;
    }
    if let Some(td) = req.transmission_distance {
        conn.execute("UPDATE shared.curated_filaments SET transmission_distance = ?1, updated_at = ?2 WHERE id = ?3",
            rusqlite::params![td, now, id]).map_err(map_err)?;
    }
    if let Some(owned) = req.owned {
        conn.execute("UPDATE shared.curated_filaments SET owned = ?1, updated_at = ?2 WHERE id = ?3",
            rusqlite::params![if owned { 1 } else { 0 }, now, id]).map_err(map_err)?;
    }
    Ok(())
}

#[tauri::command]
pub fn delete_curated_filament(db: State<Database>, id: String) -> CmdResult<()> {
    let conn = db.conn();
    let conn = conn.as_ref().ok_or("Database not available — check your library path")?;
    conn.execute("DELETE FROM shared.curated_filaments WHERE id = ?1", rusqlite::params![id]).map_err(map_err)?;
    Ok(())
}

#[tauri::command]
pub fn import_curated_filaments(db: State<Database>, file_path: String) -> CmdResult<i32> {
    let conn = db.conn();
    let conn = conn.as_ref().ok_or("Database not available — check your library path")?;
    let content = fs::read_to_string(&file_path).map_err(map_err)?;
    let json: serde_json::Value = serde_json::from_str(&content).map_err(map_err)?;

    // Support both bare array and { "Filaments": [...] } wrapper
    let arr = json.as_array()
        .or_else(|| json.get("Filaments").and_then(|v| v.as_array()))
        .ok_or("Expected JSON array or { \"Filaments\": [...] }")?;
    let now = Utc::now().to_rfc3339();
    let mut count = 0;

    for item in arr {
        // Skip IMAGE type entries (check both "Type" and "Material")
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
        let uuid = item.get("uuid").and_then(|v| v.as_str())
            .or_else(|| item.get("UUID").and_then(|v| v.as_str()));

        if name.is_empty() { continue; }

        let owned = item.get("Owned").and_then(|v| v.as_bool()).unwrap_or(false);
        let (brand, line) = Database::split_brand_line(brand_raw);
        let id = Uuid::new_v4().to_string();

        let result = conn.execute(
            "INSERT OR IGNORE INTO shared.curated_filaments (id, brand, line, material, name, color, transmission_distance, owned, source_uuid, created_at, updated_at)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11)",
            rusqlite::params![id, brand, line, material, name, color, td, owned, uuid, now, now],
        );
        if let Ok(n) = result {
            count += n as i32;
        }
        // If the entry already existed and the import says owned, update owned flag
        if owned {
            let _ = conn.execute(
                "UPDATE shared.curated_filaments SET owned = 1, updated_at = ?1
                 WHERE LOWER(brand) = LOWER(?2) AND LOWER(line) = LOWER(?3) AND LOWER(name) = LOWER(?4)",
                rusqlite::params![now, brand, line, name],
            );
        }
    }

    Ok(count)
}

#[tauri::command]
pub fn get_project_filaments_v2(db: State<Database>, project_id: String) -> CmdResult<Vec<ProjectFilamentDisplay>> {
    let conn = db.conn();
    let conn = conn.as_ref().ok_or("Database not available — check your library path")?;
    get_project_filaments_display(conn, &project_id).map_err(map_err)
}

#[tauri::command]
pub fn match_project_filament(db: State<Database>, req: MatchFilamentRequest) -> CmdResult<()> {
    let conn = db.conn();
    let conn = conn.as_ref().ok_or("Database not available — check your library path")?;
    conn.execute(
        "UPDATE project_filaments SET curated_filament_id = ?1, match_status = 'confirmed' WHERE id = ?2",
        rusqlite::params![req.curated_filament_id, req.project_filament_id],
    ).map_err(map_err)?;
    Ok(())
}

#[tauri::command]
pub fn unmatch_project_filament(db: State<Database>, project_filament_id: String) -> CmdResult<()> {
    let conn = db.conn();
    let conn = conn.as_ref().ok_or("Database not available — check your library path")?;
    conn.execute(
        "UPDATE project_filaments SET curated_filament_id = NULL, match_status = 'unmatched' WHERE id = ?1",
        rusqlite::params![project_filament_id],
    ).map_err(map_err)?;
    Ok(())
}

#[tauri::command]
pub fn rematch_all_project_filaments(db: State<Database>, project_id: String) -> CmdResult<()> {
    let conn = db.conn();
    let conn = conn.as_ref().ok_or("Database not available — check your library path")?;
    // Reset all non-confirmed matches
    conn.execute(
        "UPDATE project_filaments SET curated_filament_id = NULL, match_status = 'unmatched' WHERE project_id = ?1 AND match_status != 'confirmed'",
        rusqlite::params![project_id],
    ).map_err(map_err)?;
    Database::run_matching_all(conn).map_err(map_err)?;
    Ok(())
}

#[tauri::command]
pub fn rematch_unmatched_filaments(db: State<Database>) -> CmdResult<u32> {
    let conn = db.conn();
    let conn = conn.as_ref().ok_or("Database not available — check your library path")?;
    let before: u32 = conn.query_row(
        "SELECT COUNT(*) FROM project_filaments WHERE match_status = 'unmatched'",
        [],
        |row| row.get(0),
    ).map_err(map_err)?;
    Database::run_matching_all(conn).map_err(map_err)?;
    let after: u32 = conn.query_row(
        "SELECT COUNT(*) FROM project_filaments WHERE match_status = 'unmatched'",
        [],
        |row| row.get(0),
    ).map_err(map_err)?;
    Ok(before - after)
}

#[tauri::command]
pub fn clear_all_curated_filaments(db: State<Database>) -> CmdResult<()> {
    let conn = db.conn();
    let conn = conn.as_ref().ok_or("Database not available — check your library path")?;
    // Clear matches that reference curated filaments
    conn.execute(
        "UPDATE project_filaments SET curated_filament_id = NULL, match_status = 'unmatched'",
        [],
    ).map_err(map_err)?;
    conn.execute("DELETE FROM shared.curated_filaments", []).map_err(map_err)?;
    Ok(())
}

#[tauri::command]
pub fn reset_curated_filaments(db: State<Database>) -> CmdResult<()> {
    let conn = db.conn();
    let conn = conn.as_ref().ok_or("Database not available — check your library path")?;
    // Clear matches and delete all curated filaments
    conn.execute(
        "UPDATE project_filaments SET curated_filament_id = NULL, match_status = 'unmatched'",
        [],
    ).map_err(map_err)?;
    conn.execute("DELETE FROM shared.curated_filaments", []).map_err(map_err)?;
    // Re-seed with defaults
    Database::seed_default_filaments(conn);
    Ok(())
}

#[tauri::command]
pub fn reparse_all_project_filaments(db: State<Database>) -> CmdResult<u32> {
    let conn = db.conn();
    let conn = conn.as_ref().ok_or("Database not available — check your library path")?;

    // Delete all non-manual project_filaments (preserve manually added ones)
    conn.execute("DELETE FROM project_filaments WHERE is_manual = 0", []).map_err(map_err)?;

    // Find all favorited files and re-parse their metadata
    let mut stmt = conn.prepare(
        "SELECT id, project_id, file_path, original_filename FROM files WHERE favorited = 1"
    ).map_err(map_err)?;

    let files: Vec<(String, String, String, String)> = stmt.query_map([], |row| {
        Ok((row.get(0)?, row.get(1)?, row.get(2)?, row.get(3)?))
    }).map_err(map_err)?.filter_map(|r| r.ok()).collect();

    // First pass: parse all files and update metadata, collect filament data
    struct ParsedFile {
        file_id: String,
        project_id: String,
        ext: String,
        filaments: Vec<FilamentInfo>,
    }
    let mut parsed: Vec<ParsedFile> = Vec::new();
    for (file_id, project_id, file_path, filename) in &files {
        let metadata = parse_file_metadata(file_path, filename);
        let metadata_json = serde_json::to_string(&metadata).unwrap_or_else(|_| "{}".to_string());
        conn.execute(
            "UPDATE files SET metadata = ?1 WHERE id = ?2",
            rusqlite::params![metadata_json, file_id],
        ).map_err(map_err)?;

        let ext = filename.rsplit('.').next().unwrap_or("").to_lowercase();
        let filaments = metadata.filaments.unwrap_or_default();
        parsed.push(ParsedFile { file_id: file_id.clone(), project_id: project_id.clone(), ext, filaments });
    }

    // Determine which projects have hfp/txt filament sources
    let mut projects_with_hfp_txt = std::collections::HashSet::new();
    for pf in &parsed {
        if (pf.ext == "hfp" || pf.ext == "txt") && !pf.filaments.is_empty() {
            projects_with_hfp_txt.insert(pf.project_id.clone());
        }
    }

    // Second pass: insert filaments, skipping 3mf when hfp/txt exists
    let mut added: u32 = 0;
    for pf in &parsed {
        if pf.filaments.is_empty() { continue; }
        if pf.ext == "3mf" && projects_with_hfp_txt.contains(&pf.project_id) {
            continue;
        }
        for f in &pf.filaments {
            let pf_id = Uuid::new_v4().to_string();
            conn.execute(
                "INSERT INTO project_filaments (id, project_id, file_id, parsed_color, parsed_brand, parsed_name, match_status)
                 VALUES (?1, ?2, ?3, ?4, ?5, ?6, 'unmatched')",
                rusqlite::params![pf_id, pf.project_id, pf.file_id, f.color, f.brand, f.name],
            ).map_err(map_err)?;
            added += 1;
        }
    }

    // Run matching on all unmatched
    Database::run_matching_all(conn).map_err(map_err)?;

    Ok(added)
}

// ── Manual Filament Management ──

#[tauri::command]
pub fn add_manual_project_filament(db: State<Database>, project_id: String, curated_filament_id: String) -> CmdResult<()> {
    let conn = db.conn();
    let conn = conn.as_ref().ok_or("Database not available — check your library path")?;

    // Look up the curated filament
    let (color, brand, line, name, td): (String, String, String, String, Option<f64>) = conn.query_row(
        "SELECT color, brand, line, name, transmission_distance FROM shared.curated_filaments WHERE id = ?1",
        rusqlite::params![curated_filament_id],
        |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?, row.get(3)?, row.get(4)?)),
    ).map_err(map_err)?;

    let parsed_brand = if line.is_empty() { brand.clone() } else { format!("{} {}", brand, line) };
    let pf_id = Uuid::new_v4().to_string();

    conn.execute(
        "INSERT INTO project_filaments (id, project_id, file_id, curated_filament_id, parsed_color, parsed_brand, parsed_name, parsed_td, match_status, is_manual)
         VALUES (?1, ?2, NULL, ?3, ?4, ?5, ?6, ?7, 'confirmed', 1)",
        rusqlite::params![pf_id, project_id, curated_filament_id, color, parsed_brand, name, td],
    ).map_err(map_err)?;

    Ok(())
}

#[tauri::command]
pub fn remove_project_filament(db: State<Database>, project_filament_id: String) -> CmdResult<()> {
    let conn = db.conn();
    let conn = conn.as_ref().ok_or("Database not available — check your library path")?;
    conn.execute(
        "DELETE FROM project_filaments WHERE id = ?1",
        rusqlite::params![project_filament_id],
    ).map_err(map_err)?;
    Ok(())
}

#[tauri::command]
pub fn reset_project_filament(db: State<Database>, project_filament_id: String) -> CmdResult<()> {
    let conn = db.conn();
    let conn = conn.as_ref().ok_or("Database not available — check your library path")?;

    // Get the parsed values from the project_filament
    let (parsed_color, parsed_brand, parsed_name): (String, String, String) = conn.query_row(
        "SELECT parsed_color, parsed_brand, parsed_name FROM project_filaments WHERE id = ?1",
        rusqlite::params![project_filament_id],
        |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?)),
    ).map_err(map_err)?;

    // Try to find a match
    match Database::find_match(conn, &parsed_color, &parsed_brand, &parsed_name).map_err(map_err)? {
        Some((curated_id, status)) => {
            conn.execute(
                "UPDATE project_filaments SET curated_filament_id = ?1, match_status = ?2 WHERE id = ?3",
                rusqlite::params![curated_id, status, project_filament_id],
            ).map_err(map_err)?;
        }
        None => {
            conn.execute(
                "UPDATE project_filaments SET curated_filament_id = NULL, match_status = 'unmatched' WHERE id = ?1",
                rusqlite::params![project_filament_id],
            ).map_err(map_err)?;
        }
    }

    Ok(())
}

// ── Data Export ──

#[tauri::command]
pub fn export_data(db: State<Database>) -> CmdResult<String> {
    let conn = db.conn();
    let conn = conn.as_ref().ok_or("Database not available — check your library path")?;

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

// ── Project Export/Import ──

#[tauri::command]
pub fn export_project(db: State<Database>, project_id: String, dest_path: String) -> CmdResult<()> {
    let conn = db.conn();
    let conn = conn.as_ref().ok_or("Database not available — check your library path")?;

    // Get project
    let (name, description, thumb_path, created_at, updated_at, pw, ph, pt): (String, String, Option<String>, String, String, Option<f64>, Option<f64>, Option<i64>) = conn.query_row(
        "SELECT name, description, thumbnail_path, created_at, updated_at, print_width_mm, print_height_mm, print_time_mins FROM projects WHERE id = ?1",
        rusqlite::params![project_id],
        |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?, row.get(3)?, row.get(4)?, row.get(5)?, row.get(6)?, row.get(7)?)),
    ).map_err(map_err)?;

    // Get tags
    let mut tag_stmt = conn.prepare(
        "SELECT t.name, t.color FROM tags t JOIN project_tags pt ON t.id = pt.tag_id WHERE pt.project_id = ?1"
    ).map_err(map_err)?;
    let tags: Vec<serde_json::Value> = tag_stmt.query_map(
        rusqlite::params![project_id],
        |row| Ok(serde_json::json!({ "name": row.get::<_, String>(0)?, "color": row.get::<_, String>(1)? })),
    ).map_err(map_err)?.filter_map(|r| r.ok()).collect();

    // Get collections
    let mut coll_stmt = conn.prepare(
        "SELECT c.name, c.description FROM collections c JOIN project_collections pc ON c.id = pc.collection_id WHERE pc.project_id = ?1"
    ).map_err(map_err)?;
    let collections: Vec<serde_json::Value> = coll_stmt.query_map(
        rusqlite::params![project_id],
        |row| Ok(serde_json::json!({ "name": row.get::<_, String>(0)?, "description": row.get::<_, String>(1)? })),
    ).map_err(map_err)?.filter_map(|r| r.ok()).collect();

    // Get files
    let mut file_stmt = conn.prepare(
        "SELECT id, file_path, original_filename, file_size, notes, thumbnail_path, favorited, metadata, created_at, modified_at FROM files WHERE project_id = ?1"
    ).map_err(map_err)?;
    let files: Vec<(String, String, String, i64, String, Option<String>, bool, String, String, String)> = file_stmt.query_map(
        rusqlite::params![project_id],
        |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?, row.get(3)?, row.get(4)?, row.get(5)?, row.get(6)?, row.get(7)?, row.get(8)?, row.get(9)?)),
    ).map_err(map_err)?.filter_map(|r| r.ok()).collect();

    // Get project filaments
    let mut pf_stmt = conn.prepare(
        "SELECT pf.parsed_color, pf.parsed_brand, pf.parsed_name, pf.parsed_td, pf.match_status, pf.is_manual,
                cf.brand, cf.line, cf.material, cf.name, cf.color, cf.transmission_distance, cf.owned, cf.source_uuid
         FROM project_filaments pf
         LEFT JOIN shared.curated_filaments cf ON pf.curated_filament_id = cf.id
         WHERE pf.project_id = ?1"
    ).map_err(map_err)?;
    let filaments: Vec<serde_json::Value> = pf_stmt.query_map(
        rusqlite::params![project_id],
        |row| {
            let curated = if row.get::<_, Option<String>>(6)?.is_some() {
                Some(serde_json::json!({
                    "brand": row.get::<_, String>(6)?,
                    "line": row.get::<_, String>(7)?,
                    "material": row.get::<_, String>(8)?,
                    "name": row.get::<_, String>(9)?,
                    "color": row.get::<_, String>(10)?,
                    "transmission_distance": row.get::<_, Option<f64>>(11)?,
                    "owned": row.get::<_, bool>(12)?,
                    "source_uuid": row.get::<_, Option<String>>(13)?,
                }))
            } else {
                None
            };
            Ok(serde_json::json!({
                "parsed_color": row.get::<_, String>(0)?,
                "parsed_brand": row.get::<_, String>(1)?,
                "parsed_name": row.get::<_, String>(2)?,
                "parsed_td": row.get::<_, Option<f64>>(3)?,
                "match_status": row.get::<_, String>(4)?,
                "is_manual": row.get::<_, bool>(5)?,
                "curated_filament": curated,
            }))
        },
    ).map_err(map_err)?.filter_map(|r| r.ok()).collect();

    // Build file manifest
    let file_manifest: Vec<serde_json::Value> = files.iter().map(|(_, _, filename, file_size, notes, _, favorited, metadata, created_at, modified_at)| {
        serde_json::json!({
            "original_filename": filename,
            "file_size": file_size,
            "notes": notes,
            "favorited": favorited,
            "metadata": metadata,
            "created_at": created_at,
            "modified_at": modified_at,
        })
    }).collect();

    let manifest = serde_json::json!({
        "version": 1,
        "exported_at": Utc::now().to_rfc3339(),
        "project": {
            "name": name,
            "description": description,
            "created_at": created_at,
            "updated_at": updated_at,
            "print_width_mm": pw,
            "print_height_mm": ph,
            "print_time_mins": pt,
        },
        "tags": tags,
        "collections": collections,
        "files": file_manifest,
        "filaments": filaments,
    });

    // Create ZIP
    let output_file = fs::File::create(&dest_path).map_err(map_err)?;
    let mut zip = zip::ZipWriter::new(output_file);
    let options = zip::write::SimpleFileOptions::default().compression_method(zip::CompressionMethod::Deflated);

    // Write manifest
    zip.start_file("manifest.json", options).map_err(map_err)?;
    let manifest_bytes = serde_json::to_string_pretty(&manifest).map_err(map_err)?;
    std::io::Write::write_all(&mut zip, manifest_bytes.as_bytes()).map_err(map_err)?;

    // Write project thumbnail
    if let Some(ref tp) = thumb_path {
        let src = Path::new(tp);
        if src.exists() {
            let ext = src.extension().and_then(|e| e.to_str()).unwrap_or("png");
            zip.start_file(format!("thumbnail.{}", ext), options).map_err(map_err)?;
            let mut f = fs::File::open(src).map_err(map_err)?;
            std::io::copy(&mut f, &mut zip).map_err(map_err)?;
        }
    }

    // Write files and their thumbnails (streaming to avoid loading into memory)
    for (file_id, file_path, filename, _, _, thumb_path, _, _, _, _) in &files {
        let src = Path::new(file_path);
        if src.exists() {
            let file_size = fs::metadata(src).map(|m| m.len()).unwrap_or(0);
            if file_size > MAX_FILE_SIZE {
                eprintln!("Skipping oversized file in export: {} ({} bytes)", filename, file_size);
                continue;
            }
            zip.start_file(format!("files/{}", filename), options).map_err(map_err)?;
            let mut f = fs::File::open(src).map_err(map_err)?;
            std::io::copy(&mut f, &mut zip).map_err(map_err)?;
        }

        if let Some(tp) = thumb_path {
            let src_thumb = Path::new(tp);
            if src_thumb.exists() {
                let ext = src_thumb.extension().and_then(|e| e.to_str()).unwrap_or("png");
                zip.start_file(format!("thumbnails/file_{}.{}", file_id, ext), options).map_err(map_err)?;
                let mut f = fs::File::open(src_thumb).map_err(map_err)?;
                std::io::copy(&mut f, &mut zip).map_err(map_err)?;
            }
        }
    }

    zip.finish().map_err(map_err)?;
    Ok(())
}

#[tauri::command]
pub fn import_project(db: State<Database>, file_path: String) -> CmdResult<Project> {
    let conn = db.conn();
    let conn = conn.as_ref().ok_or("Database not available — check your library path")?;

    let file = fs::File::open(&file_path).map_err(map_err)?;
    let mut archive = zip::ZipArchive::new(file).map_err(map_err)?;

    // Read manifest
    let manifest: serde_json::Value = {
        let manifest_file = archive.by_name("manifest.json").map_err(map_err)?;
        serde_json::from_reader(manifest_file).map_err(map_err)?
    };

    let version = manifest["version"].as_i64().unwrap_or(0);
    if version != 1 {
        return Err(format!("Unsupported project export version: {}", version));
    }

    let project_data = &manifest["project"];
    let new_id = Uuid::new_v4().to_string();
    let now = Utc::now().to_rfc3339();
    let name = project_data["name"].as_str().unwrap_or("Imported Project");
    let description = project_data["description"].as_str().unwrap_or("");
    let pw = project_data["print_width_mm"].as_f64();
    let ph = project_data["print_height_mm"].as_f64();
    let pt = project_data["print_time_mins"].as_i64();

    // Create project
    conn.execute(
        "INSERT INTO projects (id, name, description, print_width_mm, print_height_mm, print_time_mins, created_at, updated_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)",
        rusqlite::params![new_id, name, description, pw, ph, pt, now, now],
    ).map_err(map_err)?;

    // Create directories
    let project_dir = Database::data_dir().join("projects").join(&new_id);
    let files_dir = project_dir.join("files");
    let thumb_dir = project_dir.join("thumbnails");
    fs::create_dir_all(&files_dir).map_err(map_err)?;
    fs::create_dir_all(&thumb_dir).map_err(map_err)?;

    // Extract project thumbnail
    let mut cover_thumb_path: Option<String> = None;
    for ext in &["png", "jpg", "jpeg", "svg", "webp"] {
        let thumb_name = format!("thumbnail.{}", ext);
        if let Ok(mut entry) = archive.by_name(&thumb_name) {
            let dest = thumb_dir.join(format!("cover.{}", ext));
            let mut out = fs::File::create(&dest).map_err(map_err)?;
            std::io::copy(&mut entry, &mut out).map_err(map_err)?;
            cover_thumb_path = Some(dest.to_string_lossy().to_string());
            break;
        }
    }

    if let Some(ref tp) = cover_thumb_path {
        conn.execute(
            "UPDATE projects SET thumbnail_path = ?1 WHERE id = ?2",
            rusqlite::params![tp, new_id],
        ).map_err(map_err)?;
    }

    // Import tags (create if they don't exist, then link)
    if let Some(tags) = manifest["tags"].as_array() {
        for tag in tags {
            let tag_name = match tag["name"].as_str() {
                Some(n) => n,
                None => continue,
            };
            let tag_color = tag["color"].as_str().unwrap_or("#6366f1");

            // Find or create tag
            let tag_id: String = match conn.query_row(
                "SELECT id FROM tags WHERE LOWER(name) = LOWER(?1)",
                rusqlite::params![tag_name],
                |row| row.get(0),
            ) {
                Ok(id) => id,
                Err(_) => {
                    let new_tag_id = Uuid::new_v4().to_string();
                    conn.execute(
                        "INSERT INTO tags (id, name, color) VALUES (?1, ?2, ?3)",
                        rusqlite::params![new_tag_id, tag_name, tag_color],
                    ).map_err(map_err)?;
                    new_tag_id
                }
            };

            let _ = conn.execute(
                "INSERT OR IGNORE INTO project_tags (project_id, tag_id) VALUES (?1, ?2)",
                rusqlite::params![new_id, tag_id],
            );
        }
    }

    // Import collections (create if they don't exist, then link)
    if let Some(collections) = manifest["collections"].as_array() {
        for coll in collections {
            let coll_name = match coll["name"].as_str() {
                Some(n) => n,
                None => continue,
            };
            let coll_desc = coll["description"].as_str().unwrap_or("");

            let coll_id: String = match conn.query_row(
                "SELECT id FROM collections WHERE LOWER(name) = LOWER(?1)",
                rusqlite::params![coll_name],
                |row| row.get(0),
            ) {
                Ok(id) => id,
                Err(_) => {
                    let new_coll_id = Uuid::new_v4().to_string();
                    conn.execute(
                        "INSERT INTO collections (id, name, description, created_at, updated_at) VALUES (?1, ?2, ?3, ?4, ?5)",
                        rusqlite::params![new_coll_id, coll_name, coll_desc, now, now],
                    ).map_err(map_err)?;
                    new_coll_id
                }
            };

            let _ = conn.execute(
                "INSERT OR IGNORE INTO project_collections (project_id, collection_id) VALUES (?1, ?2)",
                rusqlite::params![new_id, coll_id],
            );
        }
    }

    // Import files
    if let Some(file_entries) = manifest["files"].as_array() {
        for file_entry in file_entries {
            let filename = match file_entry["original_filename"].as_str() {
                Some(f) => f,
                None => continue,
            };

            // Validate filename to prevent path traversal (zip slip)
            if !is_safe_filename(filename) {
                eprintln!("Skipping unsafe filename in import: {:?}", filename);
                continue;
            }

            let notes = file_entry["notes"].as_str().unwrap_or("");
            let favorited = file_entry["favorited"].as_bool().unwrap_or(false);
            let metadata = file_entry["metadata"].as_str().unwrap_or("{}");
            let created_at = file_entry["created_at"].as_str().unwrap_or(&now);
            let modified_at = file_entry["modified_at"].as_str().unwrap_or(&now);

            // Extract file from archive
            let archive_path = format!("files/{}", filename);
            let file_dest = files_dir.join(filename);

            // Verify the resolved path is within the target directory
            let canonical_files_dir = fs::canonicalize(&files_dir).map_err(map_err)?;
            if let Ok(mut entry) = archive.by_name(&archive_path) {
                // Check entry size before extracting
                if entry.size() > MAX_FILE_SIZE {
                    eprintln!("Skipping oversized file in import: {} ({} bytes)", filename, entry.size());
                    continue;
                }
                let mut out = fs::File::create(&file_dest).map_err(map_err)?;
                std::io::copy(&mut entry, &mut out).map_err(map_err)?;

                // Verify file was written inside the expected directory
                if let Ok(canonical_dest) = fs::canonicalize(&file_dest) {
                    if !canonical_dest.starts_with(&canonical_files_dir) {
                        let _ = fs::remove_file(&file_dest);
                        eprintln!("Path traversal detected, removed: {:?}", file_dest);
                        continue;
                    }
                }
            } else {
                continue; // skip files not found in archive
            }

            let file_size = fs::metadata(&file_dest).map(|m| m.len() as i64).unwrap_or(0);
            let new_file_id = Uuid::new_v4().to_string();

            let mut file_thumb_path: Option<String> = None;
            // Re-generate thumbnails for 3MF files during import
            let ext = filename.split('.').last().unwrap_or("").to_lowercase();
            if ext == "3mf" {
                file_thumb_path = thumbnails::extract_3mf_thumbnail(&file_dest)
                    .and_then(|bytes| {
                        thumbnails::generate_thumbnail(&bytes, &thumb_dir, &format!("file_{}.png", new_file_id))
                    })
                    .map(|p| p.to_string_lossy().to_string());
            }

            conn.execute(
                "INSERT INTO files (id, project_id, file_path, original_filename, file_size, notes, thumbnail_path, favorited, metadata, created_at, modified_at)
                 VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11)",
                rusqlite::params![new_file_id, new_id, file_dest.to_string_lossy().to_string(), filename, file_size, notes, file_thumb_path, favorited, metadata, created_at, modified_at],
            ).map_err(map_err)?;
        }
    }

    // Import filaments
    if let Some(filament_entries) = manifest["filaments"].as_array() {
        for entry in filament_entries {
            let parsed_color = entry["parsed_color"].as_str().unwrap_or("");
            let parsed_brand = entry["parsed_brand"].as_str().unwrap_or("");
            let parsed_name = entry["parsed_name"].as_str().unwrap_or("");
            let parsed_td = entry["parsed_td"].as_f64();
            let is_manual = entry["is_manual"].as_bool().unwrap_or(false);

            // If there's curated filament data, ensure it exists in the shared db
            let mut curated_id: Option<String> = None;
            let mut match_status = "unmatched".to_string();

            if let Some(curated) = entry["curated_filament"].as_object() {
                let cf_brand = curated.get("brand").and_then(|v| v.as_str()).unwrap_or("");
                let cf_line = curated.get("line").and_then(|v| v.as_str()).unwrap_or("");
                let cf_name = curated.get("name").and_then(|v| v.as_str()).unwrap_or("");

                // Try to find existing curated filament
                match conn.query_row(
                    "SELECT id FROM shared.curated_filaments WHERE LOWER(brand) = LOWER(?1) AND LOWER(line) = LOWER(?2) AND LOWER(name) = LOWER(?3)",
                    rusqlite::params![cf_brand, cf_line, cf_name],
                    |row| row.get::<_, String>(0),
                ) {
                    Ok(id) => {
                        curated_id = Some(id);
                        match_status = entry["match_status"].as_str().unwrap_or("exact").to_string();
                    }
                    Err(_) => {
                        // Try to match using the standard matching algorithm
                        match Database::find_match(conn, parsed_color, parsed_brand, parsed_name).map_err(map_err)? {
                            Some((id, status)) => {
                                curated_id = Some(id);
                                match_status = status;
                            }
                            None => {}
                        }
                    }
                }
            } else {
                // No curated data, try matching
                match Database::find_match(conn, parsed_color, parsed_brand, parsed_name).map_err(map_err)? {
                    Some((id, status)) => {
                        curated_id = Some(id);
                        match_status = status;
                    }
                    None => {}
                }
            }

            let pf_id = Uuid::new_v4().to_string();
            conn.execute(
                "INSERT INTO project_filaments (id, project_id, file_id, curated_filament_id, parsed_color, parsed_brand, parsed_name, parsed_td, match_status, is_manual)
                 VALUES (?1, ?2, NULL, ?3, ?4, ?5, ?6, ?7, ?8, ?9)",
                rusqlite::params![pf_id, new_id, curated_id, parsed_color, parsed_brand, parsed_name, parsed_td, match_status, is_manual],
            ).map_err(map_err)?;
        }
    }

    let tags = get_project_tags(conn, &new_id).map_err(map_err)?;
    let collections = get_project_collections(conn, &new_id).map_err(map_err)?;

    Ok(Project {
        id: new_id,
        name: name.to_string(),
        description: description.to_string(),
        thumbnail_path: cover_thumb_path,
        created_at: now.clone(),
        updated_at: now,
        tags,
        collections,
        print_width_mm: pw,
        print_height_mm: ph,
        print_time_mins: pt,
    })
}

#[tauri::command]
pub fn get_data_dir() -> String {
    Database::data_dir().to_string_lossy().to_string()
}

// ── Libraries ──

#[tauri::command]
pub fn is_first_launch() -> bool {
    config::is_first_launch()
}

#[tauri::command]
pub fn setup_library(db: State<Database>, path: Option<String>) -> CmdResult<()> {
    let mut cfg = config::get_config();
    if let Some(p) = path {
        let name = std::path::Path::new(&p)
            .file_name()
            .map(|n| n.to_string_lossy().to_string())
            .unwrap_or_else(|| "Library".to_string());
        cfg.libraries = vec![config::LibraryEntry { path: p, name }];
        cfg.active_library = 0;
    }
    config::save_config(&cfg).map_err(map_err)?;
    // Force config reload so library_path() picks up the new value
    config::reload_config();
    // Ensure the library directory exists
    let lib_path = config::library_path();
    fs::create_dir_all(lib_path.join("projects")).map_err(map_err)?;
    fs::create_dir_all(lib_path.join("deleted")).map_err(map_err)?;
    // Initialize the database connection for the new library
    db.reconnect();
    Ok(())
}

#[tauri::command]
pub fn get_library_path() -> String {
    config::library_path().to_string_lossy().to_string()
}

#[tauri::command]
pub fn get_libraries() -> CmdResult<LibrariesResponse> {
    let (libraries, active) = config::get_libraries();
    Ok(LibrariesResponse {
        libraries: libraries.into_iter().map(|l| LibraryInfo { name: l.name, path: l.path }).collect(),
        active_index: active,
    })
}

#[tauri::command]
pub fn add_library(name: String, path: String) -> CmdResult<()> {
    let lib_path = std::path::PathBuf::from(&path);
    fs::create_dir_all(&lib_path).map_err(map_err)?;
    config::add_library(name, path).map_err(map_err)?;
    Ok(())
}

#[tauri::command]
pub fn remove_library(db: State<Database>, index: usize) -> CmdResult<()> {
    let was_active = config::get_config().active_library == index;
    config::remove_library(index).map_err(map_err)?;
    // If we removed the active library, reconnect to the new active one
    if was_active {
        db.reconnect();
    }
    Ok(())
}

#[tauri::command]
pub fn switch_library(db: State<Database>, index: usize) -> CmdResult<()> {
    config::switch_library(index).map_err(map_err)?;
    db.reconnect();
    Ok(())
}

#[tauri::command]
pub fn rename_library(index: usize, name: String) -> CmdResult<()> {
    config::rename_library(index, name).map_err(map_err)?;
    Ok(())
}

#[tauri::command]
pub fn set_library_path(db: State<Database>, path: String, move_data: bool) -> CmdResult<()> {
    let old_path = config::library_path();
    let new_path = std::path::PathBuf::from(&path);

    fs::create_dir_all(&new_path).map_err(map_err)?;

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
        for ext in &["db.sqlite-wal", "db.sqlite-shm"] {
            let old_f = old_path.join(ext);
            let new_f = new_path.join(ext);
            if old_f.exists() {
                let _ = fs::copy(&old_f, &new_f);
            }
        }
    }

    config::set_library_path(path)?;
    // Reconnect to the database at the new location
    db.reconnect();
    Ok(())
}

#[tauri::command]
pub fn get_storage_sizes() -> CmdResult<StorageSizes> {
    let base = Database::data_dir();
    let projects_size = dir_size(&base.join("projects"));
    let deleted_size = dir_size(&base.join("deleted"));
    Ok(StorageSizes { projects_size, deleted_size })
}

#[tauri::command]
pub fn empty_trash() -> CmdResult<()> {
    let trash_dir = Database::data_dir().join("deleted");
    if trash_dir.exists() {
        fs::remove_dir_all(&trash_dir).map_err(map_err)?;
    }
    Ok(())
}

fn dir_size(path: &Path) -> u64 {
    if !path.exists() {
        return 0;
    }
    walkdir(path)
}

fn walkdir(path: &Path) -> u64 {
    let mut total: u64 = 0;
    if let Ok(entries) = fs::read_dir(path) {
        for entry in entries.flatten() {
            let p = entry.path();
            if p.is_dir() {
                total += walkdir(&p);
            } else if let Ok(meta) = p.metadata() {
                total += meta.len();
            }
        }
    }
    total
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

fn get_project_filaments_display(conn: &Connection, project_id: &str) -> Result<Vec<ProjectFilamentDisplay>, rusqlite::Error> {
    let mut stmt = conn.prepare(
        "SELECT pf.id, pf.curated_filament_id, pf.parsed_color, pf.parsed_brand, pf.parsed_name, pf.parsed_td, pf.match_status,
                cf.brand, cf.line, cf.material, cf.name, cf.color, cf.transmission_distance, cf.owned, pf.is_manual
         FROM project_filaments pf
         LEFT JOIN shared.curated_filaments cf ON pf.curated_filament_id = cf.id
         WHERE pf.project_id = ?1
         ORDER BY COALESCE(cf.brand, pf.parsed_brand), COALESCE(cf.name, pf.parsed_name)"
    )?;

    let rows = stmt.query_map(rusqlite::params![project_id], |row| {
        let curated_id: Option<String> = row.get(1)?;
        let has_curated = curated_id.is_some();
        Ok(ProjectFilamentDisplay {
            project_filament_id: row.get(0)?,
            curated_filament_id: curated_id,
            parsed_color: row.get(2)?,
            parsed_brand: row.get(3)?,
            parsed_name: row.get(4)?,
            parsed_td: row.get(5)?,
            match_status: row.get(6)?,
            brand: if has_curated { row.get::<_, String>(7).unwrap_or_default() } else { row.get::<_, String>(3).unwrap_or_default() },
            line: if has_curated { row.get::<_, String>(8).unwrap_or_default() } else { String::new() },
            material: if has_curated { row.get::<_, String>(9).unwrap_or_default() } else { String::from("PLA") },
            name: if has_curated { row.get::<_, String>(10).unwrap_or_default() } else { row.get::<_, String>(4).unwrap_or_default() },
            color: if has_curated { row.get::<_, String>(11).unwrap_or_default() } else { row.get::<_, String>(2).unwrap_or_default() },
            td: if has_curated { row.get(12)? } else { row.get(5)? },
            owned: if has_curated { row.get::<_, i32>(13).unwrap_or(0) != 0 } else { false },
            is_manual: row.get::<_, i32>(14).unwrap_or(0) != 0,
        })
    })?;

    // Deduplicate by curated_filament_id (or by parsed key for unmatched)
    let all: Vec<ProjectFilamentDisplay> = rows.filter_map(|r| r.ok()).collect();
    let mut seen = std::collections::HashSet::new();
    let mut result = Vec::new();
    for pf in all {
        let dedup_key = if let Some(ref cid) = pf.curated_filament_id {
            cid.clone()
        } else {
            format!("{}|{}|{}", pf.parsed_color.to_lowercase(), pf.parsed_brand, pf.parsed_name)
        };
        if seen.contains(&dedup_key) { continue; }
        seen.insert(dedup_key);
        result.push(pf);
    }
    Ok(result)
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

#[tauri::command]
pub fn reset_to_default(db: State<Database>) -> CmdResult<()> {
    // Drop the database connection so files are unlocked
    db.close();

    // Delete config file (triggers first-launch welcome screen)
    let config_dir = config::config_dir_path();
    let config_file = config_dir.join("config.json");
    if config_file.exists() {
        fs::remove_file(&config_file).map_err(map_err)?;
    }

    // Delete shared filaments database
    let filaments_db = config_dir.join("filaments.sqlite");
    if filaments_db.exists() {
        let _ = fs::remove_file(&filaments_db);
    }
    // WAL/SHM files
    let _ = fs::remove_file(config_dir.join("filaments.sqlite-wal"));
    let _ = fs::remove_file(config_dir.join("filaments.sqlite-shm"));

    Ok(())
}
