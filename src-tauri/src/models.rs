use serde::{Deserialize, Deserializer, Serialize};

/// Deserializes `Option<Option<T>>` so that:
/// - missing field → `None` (via `#[serde(default)]`)
/// - JSON `null` → `Some(None)` (clear the value)
/// - JSON value → `Some(Some(value))`
fn double_option<'de, T, D>(deserializer: D) -> Result<Option<Option<T>>, D::Error>
where
    T: Deserialize<'de>,
    D: Deserializer<'de>,
{
    Ok(Some(Option::deserialize(deserializer)?))
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct Project {
    pub id: String,
    pub name: String,
    pub description: String,
    pub thumbnail_path: Option<String>,
    pub created_at: String,
    pub updated_at: String,
    pub tags: Vec<Tag>,
    pub collections: Vec<CollectionSummary>,
    pub print_width_mm: Option<f64>,
    pub print_height_mm: Option<f64>,
    pub print_time_mins: Option<i64>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct ProjectSummary {
    pub id: String,
    pub name: String,
    pub thumbnail_path: Option<String>,
    pub created_at: String,
    pub updated_at: String,
    pub tags: Vec<Tag>,
    pub file_count: i64,
    pub filaments: Vec<ProjectFilamentDisplay>,
    pub size: Option<String>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct Tag {
    pub id: String,
    pub name: String,
    pub color: String,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct TagWithCount {
    pub id: String,
    pub name: String,
    pub color: String,
    pub project_count: i64,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct Collection {
    pub id: String,
    pub name: String,
    pub description: String,
    pub cover_image_path: Option<String>,
    pub created_at: String,
    pub updated_at: String,
    pub project_count: i64,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct CollectionSummary {
    pub id: String,
    pub name: String,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct ProjectFile {
    pub id: String,
    pub project_id: String,
    pub file_path: String,
    pub original_filename: String,
    pub file_size: i64,
    pub notes: String,
    pub thumbnail_path: Option<String>,
    pub favorited: bool,
    pub metadata: String,
    pub created_at: String,
    pub modified_at: String,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct FilamentInfo {
    pub color: String,
    pub name: String,
    pub brand: String,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct CuratedFilament {
    pub id: String,
    pub brand: String,
    pub line: String,
    pub material: String,
    pub name: String,
    pub color: String,
    pub transmission_distance: Option<f64>,
    pub owned: bool,
    pub source_uuid: Option<String>,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct CuratedFilamentWithCount {
    pub id: String,
    pub brand: String,
    pub line: String,
    pub material: String,
    pub name: String,
    pub color: String,
    pub transmission_distance: Option<f64>,
    pub owned: bool,
    pub source_uuid: Option<String>,
    pub created_at: String,
    pub updated_at: String,
    pub project_count: i64,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct ProjectFilamentDisplay {
    pub project_filament_id: String,
    pub curated_filament_id: Option<String>,
    pub color: String,
    pub name: String,
    pub brand: String,
    pub line: String,
    pub material: String,
    pub match_status: String,
    pub owned: bool,
    pub td: Option<f64>,
    pub parsed_color: String,
    pub parsed_brand: String,
    pub parsed_name: String,
    pub parsed_td: Option<f64>,
    pub is_manual: bool,
}

#[derive(Debug, Serialize, Deserialize, Clone, Default)]
pub struct FileMetadata {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub filament_count: Option<i32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub filaments: Option<Vec<FilamentInfo>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub width_mm: Option<f64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub height_mm: Option<f64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub layer_height: Option<f64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub max_thickness: Option<f64>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct SyncResult {
    pub added: i32,
    pub removed: i32,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct StorageSizes {
    pub projects_size: u64,
    pub deleted_size: u64,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct LibraryInfo {
    pub name: String,
    pub path: String,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct LibrariesResponse {
    pub libraries: Vec<LibraryInfo>,
    pub active_index: usize,
}

// Request types

#[derive(Debug, Deserialize)]
pub struct CreateProjectRequest {
    pub name: String,
    pub description: Option<String>,
}

#[derive(Debug, Deserialize)]
pub struct UpdateProjectRequest {
    pub name: Option<String>,
    pub description: Option<String>,
    #[serde(default, deserialize_with = "double_option")]
    pub print_width_mm: Option<Option<f64>>,
    #[serde(default, deserialize_with = "double_option")]
    pub print_height_mm: Option<Option<f64>>,
    #[serde(default, deserialize_with = "double_option")]
    pub print_time_mins: Option<Option<i64>>,
}

#[derive(Debug, Deserialize)]
pub struct CreateTagRequest {
    pub name: String,
    pub color: Option<String>,
}

#[derive(Debug, Deserialize)]
pub struct UpdateTagRequest {
    pub name: Option<String>,
    pub color: Option<String>,
}

#[derive(Debug, Deserialize)]
pub struct CreateCollectionRequest {
    pub name: String,
    pub description: Option<String>,
}

#[derive(Debug, Deserialize)]
pub struct UpdateCollectionRequest {
    pub name: Option<String>,
    pub description: Option<String>,
}

#[derive(Debug, Deserialize)]
pub struct ListProjectsRequest {
    pub search: Option<String>,
    pub tag_ids: Option<Vec<String>>,
    pub collection_id: Option<String>,
    pub filament_ids: Option<Vec<String>>,
    pub size: Option<String>,
    pub exclude_tag_ids: Option<Vec<String>>,
    pub exclude_filament_ids: Option<Vec<String>>,
    pub exclude_sizes: Option<Vec<String>>,
    pub no_filament: Option<String>,  // "include" = only no-filament projects, "exclude" = hide them
    pub owned_only: Option<bool>,
    pub all_owned: Option<bool>,
    pub sort_by: Option<String>,
    pub sort_order: Option<String>,
}

#[derive(Debug, Deserialize)]
pub struct CreateCuratedFilamentRequest {
    pub brand: String,
    pub line: Option<String>,
    pub material: Option<String>,
    pub name: String,
    pub color: Option<String>,
    pub transmission_distance: Option<f64>,
    pub owned: Option<bool>,
}

#[derive(Debug, Deserialize)]
pub struct UpdateCuratedFilamentRequest {
    pub brand: Option<String>,
    pub line: Option<String>,
    pub material: Option<String>,
    pub name: Option<String>,
    pub color: Option<String>,
    pub transmission_distance: Option<f64>,
    pub owned: Option<bool>,
}

#[derive(Debug, Deserialize)]
pub struct MatchFilamentRequest {
    pub project_filament_id: String,
    pub curated_filament_id: String,
}
