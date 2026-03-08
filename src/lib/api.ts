import { invoke } from "@tauri-apps/api/core";
import type {
  Project,
  ProjectSummary,
  Tag,
  TagWithCount,
  Collection,
  ProjectFile,
  FilamentInfo,
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

export async function duplicateProject(id: string): Promise<Project> {
  return invoke("duplicate_project", { id });
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

// ── Filament & Size Filters ──

export async function listAllFilaments(): Promise<FilamentInfo[]> {
  return invoke("list_all_filaments");
}

export async function listAllSizes(): Promise<string[]> {
  return invoke("list_all_sizes");
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

// ── Files ──

export async function getProjectFiles(projectId: string): Promise<ProjectFile[]> {
  return invoke("get_project_files", { projectId });
}

export async function importFiles(projectId: string, sourcePaths: string[]): Promise<ProjectFile[]> {
  return invoke("import_files", { projectId, sourcePaths });
}

export async function listFolderFiles(path: string): Promise<string[]> {
  return invoke("list_folder_files", { path });
}

export async function deleteFile(fileId: string): Promise<void> {
  return invoke("delete_file", { fileId });
}

export async function updateFileNotes(fileId: string, notes: string): Promise<void> {
  return invoke("update_file_notes", { fileId, notes });
}

export async function toggleFileFavorite(fileId: string): Promise<boolean> {
  return invoke("toggle_file_favorite", { fileId });
}

export async function openFileInDefaultApp(path: string): Promise<void> {
  return invoke("open_file_in_default_app", { path });
}

export async function openFileWithApp(path: string, app: string): Promise<void> {
  return invoke("open_file_with_app", { path, app });
}

export async function revealInFinder(path: string): Promise<void> {
  return invoke("reveal_in_finder", { path });
}

export async function readTextFile(path: string): Promise<string> {
  return invoke("read_text_file", { path });
}

export async function syncProjectFiles(projectId: string): Promise<{ added: number; removed: number }> {
  return invoke("sync_project_files", { projectId });
}

// ── Data Management ──

export async function exportData(): Promise<string> {
  return invoke("export_data");
}

export async function getDataDir(): Promise<string> {
  return invoke("get_data_dir");
}

// ── Library Path ──

export async function isFirstLaunch(): Promise<boolean> {
  return invoke("is_first_launch");
}

export async function setupLibrary(path?: string): Promise<void> {
  return invoke("setup_library", { path: path ?? null });
}

export async function getLibraryPath(): Promise<string> {
  return invoke("get_library_path");
}

export async function setLibraryPath(path: string, moveData: boolean): Promise<void> {
  return invoke("set_library_path", { path, moveData });
}

export async function getLibraries(): Promise<{ libraries: { name: string; path: string }[]; active_index: number }> {
  return invoke("get_libraries");
}

export async function addLibrary(name: string, path: string): Promise<void> {
  return invoke("add_library", { name, path });
}

export async function removeLibrary(index: number): Promise<void> {
  return invoke("remove_library", { index });
}

export async function switchLibrary(index: number): Promise<void> {
  return invoke("switch_library", { index });
}

export async function renameLibrary(index: number, name: string): Promise<void> {
  return invoke("rename_library", { index, name });
}

export async function getStorageSizes(): Promise<{ projects_size: number; deleted_size: number }> {
  return invoke("get_storage_sizes");
}

export async function emptyTrash(): Promise<void> {
  return invoke("empty_trash");
}
