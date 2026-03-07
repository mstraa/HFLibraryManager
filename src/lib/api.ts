import { invoke } from "@tauri-apps/api/core";
import type {
  Project,
  ProjectSummary,
  Tag,
  TagWithCount,
  Collection,
  Asset,
  Revision,
  ListProjectsRequest,
} from "./types";

// ── Projects ──

export async function createProject(name: string, description?: string): Promise<Project> {
  return invoke("create_project", { req: { name, description } });
}

export async function getProject(id: string): Promise<Project> {
  return invoke("get_project", { id });
}

export async function updateProject(id: string, updates: { name?: string; description?: string }): Promise<void> {
  return invoke("update_project", { id, req: updates });
}

export async function deleteProject(id: string): Promise<void> {
  return invoke("delete_project", { id });
}

export async function listProjects(filters: ListProjectsRequest = {}): Promise<ProjectSummary[]> {
  return invoke("list_projects", { req: filters });
}

export async function setProjectThumbnail(projectId: string, sourcePath: string): Promise<string> {
  return invoke("set_project_thumbnail", { projectId, sourcePath });
}

// ── Tags ──

export async function createTag(name: string, color?: string): Promise<Tag> {
  return invoke("create_tag", { req: { name, color } });
}

export async function listTags(): Promise<TagWithCount[]> {
  return invoke("list_tags");
}

export async function updateTag(id: string, updates: { name?: string; color?: string }): Promise<void> {
  return invoke("update_tag", { id, req: updates });
}

export async function deleteTag(id: string): Promise<void> {
  return invoke("delete_tag", { id });
}

export async function setProjectTags(projectId: string, tagIds: string[]): Promise<void> {
  return invoke("set_project_tags", { projectId, tagIds });
}

// ── Collections ──

export async function createCollection(name: string, description?: string): Promise<Collection> {
  return invoke("create_collection", { req: { name, description } });
}

export async function listCollections(): Promise<Collection[]> {
  return invoke("list_collections");
}

export async function updateCollection(id: string, updates: { name?: string; description?: string }): Promise<void> {
  return invoke("update_collection", { id, req: updates });
}

export async function deleteCollection(id: string): Promise<void> {
  return invoke("delete_collection", { id });
}

export async function addProjectToCollection(projectId: string, collectionId: string): Promise<void> {
  return invoke("add_project_to_collection", { projectId, collectionId });
}

export async function removeProjectFromCollection(projectId: string, collectionId: string): Promise<void> {
  return invoke("remove_project_from_collection", { projectId, collectionId });
}

// ── Assets & Revisions ──

export async function getProjectAssets(projectId: string): Promise<Asset[]> {
  return invoke("get_project_assets", { projectId });
}

export async function importFile(
  projectId: string,
  assetType: string,
  sourcePath: string,
  notes?: string,
): Promise<Revision> {
  return invoke("import_file", { projectId, assetType, sourcePath, notes });
}

export async function deleteRevision(revisionId: string): Promise<void> {
  return invoke("delete_revision", { revisionId });
}

export async function openFileInDefaultApp(path: string): Promise<void> {
  return invoke("open_file_in_default_app", { path });
}

export async function updateRevisionNotes(revisionId: string, notes: string): Promise<void> {
  return invoke("update_revision_notes", { revisionId, notes });
}

export async function setRevisionThumbnail(revisionId: string, sourcePath: string): Promise<string> {
  return invoke("set_revision_thumbnail", { revisionId, sourcePath });
}
