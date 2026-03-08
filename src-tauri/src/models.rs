use serde::{Deserialize, Serialize};

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct Project {
    pub id: String,
    pub name: String,
    pub description: String,
    pub creator: String,
    pub thumbnail_path: Option<String>,
    pub created_at: String,
    pub updated_at: String,
    pub tags: Vec<Tag>,
    pub collections: Vec<CollectionSummary>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct ProjectSummary {
    pub id: String,
    pub name: String,
    pub creator: String,
    pub thumbnail_path: Option<String>,
    pub created_at: String,
    pub updated_at: String,
    pub tags: Vec<Tag>,
    pub asset_types: Vec<String>,
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
pub struct Asset {
    pub id: String,
    pub project_id: String,
    pub asset_type: String,
    pub created_at: String,
    pub revisions: Vec<Revision>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct Revision {
    pub id: String,
    pub asset_id: String,
    pub version_number: i32,
    pub file_path: String,
    pub original_filename: String,
    pub notes: String,
    pub thumbnail_path: Option<String>,
    pub created_at: String,
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
    pub creator: Option<String>,
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
    pub asset_types: Option<Vec<String>>,
    pub creator: Option<String>,
    pub sort_by: Option<String>,
    pub sort_order: Option<String>,
}
