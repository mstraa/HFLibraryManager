import { invoke } from "@tauri-apps/api/core";
import type {
  Project,
  ProjectSummary,
  Tag,
  TagWithCount,
  Collection,
  ProjectFile,
  CuratedFilament,
  CuratedFilamentWithCount,
  ProjectFilamentDisplay,
  ListProjectsRequest,
} from "./types";

// ── Projects ──

export async function createProject(name: string, description?: string): Promise<Project> {
  return invoke("create_project", { req: { name, description } });
}

export async function getProject(id: string): Promise<Project> {
  return invoke("get_project", { id });
}

export async function updateProject(id: string, updates: { name?: string; description?: string; print_width_mm?: number | null; print_height_mm?: number | null; print_time_mins?: number | null }): Promise<void> {
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

export async function setProjectTemplate(id: string, isTemplate: boolean): Promise<void> {
  return invoke("set_project_template", { id, isTemplate });
}

export async function createFromTemplate(templateId: string, name: string, description?: string): Promise<Project> {
  return invoke("create_from_template", { templateId, name, description });
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

// ── Curated Filaments ──

export async function listCuratedFilaments(): Promise<CuratedFilament[]> {
  return invoke("list_curated_filaments");
}

export async function listUsedCuratedFilaments(): Promise<CuratedFilamentWithCount[]> {
  return invoke("list_used_curated_filaments");
}

export async function createCuratedFilament(req: {
  brand: string;
  line?: string;
  material?: string;
  name: string;
  color?: string;
  transmission_distance?: number;
  owned?: boolean;
}): Promise<CuratedFilament> {
  return invoke("create_curated_filament", { req });
}

export async function updateCuratedFilament(id: string, req: {
  brand?: string;
  line?: string;
  material?: string;
  name?: string;
  color?: string;
  transmission_distance?: number;
  owned?: boolean;
}): Promise<void> {
  return invoke("update_curated_filament", { id, req });
}

export async function deleteCuratedFilament(id: string): Promise<void> {
  return invoke("delete_curated_filament", { id });
}

export async function importCuratedFilaments(filePath: string): Promise<number> {
  return invoke("import_curated_filaments", { filePath });
}

// ── Project Filaments ──

export async function getProjectFilamentsV2(projectId: string): Promise<ProjectFilamentDisplay[]> {
  return invoke("get_project_filaments_v2", { projectId });
}

export async function matchProjectFilament(projectFilamentId: string, curatedFilamentId: string): Promise<void> {
  return invoke("match_project_filament", { req: { project_filament_id: projectFilamentId, curated_filament_id: curatedFilamentId } });
}

export async function rematchUnmatchedFilaments(): Promise<number> {
  return invoke("rematch_unmatched_filaments");
}

export async function clearAllCuratedFilaments(): Promise<void> {
  return invoke("clear_all_curated_filaments");
}

export async function addManualProjectFilament(projectId: string, curatedFilamentId: string): Promise<void> {
  return invoke("add_manual_project_filament", { projectId, curatedFilamentId });
}

export async function removeProjectFilament(projectFilamentId: string): Promise<void> {
  return invoke("remove_project_filament", { projectFilamentId });
}

export async function resetProjectFilament(projectFilamentId: string): Promise<void> {
  return invoke("reset_project_filament", { projectFilamentId });
}

export async function reparseAllProjectFilaments(): Promise<number> {
  return invoke("reparse_all_project_filaments");
}

// ── Size Filters ──

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

export async function exportProject(projectId: string, destPath: string): Promise<void> {
  return invoke("export_project", { projectId, destPath });
}

export async function importProject(filePath: string): Promise<Project> {
  return invoke("import_project", { filePath });
}

// ── Library Path ──

export async function isFirstLaunch(): Promise<boolean> {
  return invoke("is_first_launch");
}

export async function setupLibrary(path?: string): Promise<void> {
  return invoke("setup_library", { path: path ?? null });
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

export async function getDragIcon(): Promise<string> {
  return invoke("get_drag_icon");
}

export async function getStorageSizes(): Promise<{ projects_size: number; deleted_size: number }> {
  return invoke("get_storage_sizes");
}

export async function emptyTrash(): Promise<void> {
  return invoke("empty_trash");
}

export async function resetToDefault(): Promise<void> {
  await invoke("reset_to_default");
  window.location.reload();
}

export async function resetCuratedFilaments(): Promise<void> {
  return invoke("reset_curated_filaments");
}
