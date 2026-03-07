import { useCallback, useEffect, useState } from "react";
import { convertFileSrc } from "@tauri-apps/api/core";
import { open } from "@tauri-apps/plugin-dialog";
import {
  getProject,
  updateProject,
  deleteProject,
  setProjectThumbnail,
  getProjectAssets,
  setProjectTags,
  listTags,
  listCollections,
  addProjectToCollection,
  removeProjectFromCollection,
} from "../lib/api";
import type { Project, Asset, AssetType, TagWithCount, Collection } from "../lib/types";
import MarkdownEditor from "./MarkdownEditor";
import AssetSection from "./AssetSection";
import ConfirmDialog from "./ConfirmDialog";
import { onDragMouseDown } from "../hooks/useDrag";

const ASSET_TYPES: AssetType[] = ["affinity", "hueforge", "bambulab"];

interface ProjectDetailProps {
  projectId: string;
  onBack: () => void;
  onDeleted: () => void;
}

export default function ProjectDetail({ projectId, onBack, onDeleted }: ProjectDetailProps) {
  const [project, setProject] = useState<Project | null>(null);
  const [assets, setAssets] = useState<Asset[]>([]);
  const [allTags, setAllTags] = useState<TagWithCount[]>([]);
  const [allCollections, setAllCollections] = useState<Collection[]>([]);
  const [editingName, setEditingName] = useState(false);
  const [nameInput, setNameInput] = useState("");
  const [saveTimer, setSaveTimer] = useState<ReturnType<typeof setTimeout> | null>(null);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  const loadProject = useCallback(async () => {
    const [p, a, t, c] = await Promise.all([
      getProject(projectId),
      getProjectAssets(projectId),
      listTags(),
      listCollections(),
    ]);
    setProject(p);
    setAssets(a);
    setAllTags(t);
    setAllCollections(c);
    setNameInput(p.name);
  }, [projectId]);

  useEffect(() => {
    loadProject();
  }, [loadProject]);

  async function handleNameSave() {
    if (!project || !nameInput.trim() || nameInput.trim() === project.name) {
      setEditingName(false);
      setNameInput(project?.name ?? "");
      return;
    }
    await updateProject(projectId, { name: nameInput.trim() });
    setEditingName(false);
    loadProject();
  }

  function handleDescriptionChange(value: string) {
    if (!project) return;
    setProject({ ...project, description: value });

    // Auto-save with debounce
    if (saveTimer) clearTimeout(saveTimer);
    const timer = setTimeout(async () => {
      await updateProject(projectId, { description: value });
    }, 800);
    setSaveTimer(timer);
  }

  async function handleDescriptionBlur() {
    if (!project) return;
    if (saveTimer) clearTimeout(saveTimer);
    await updateProject(projectId, { description: project.description });
  }

  async function handleThumbnailChange() {
    const selected = await open({
      multiple: false,
      filters: [{ name: "Images", extensions: ["png", "jpg", "jpeg", "webp", "gif"] }],
    });
    if (!selected) return;
    const path = typeof selected === "string" ? selected : (selected as { path: string }).path;
    if (!path) return;
    await setProjectThumbnail(projectId, path);
    loadProject();
  }

  async function handleToggleTag(tagId: string) {
    if (!project) return;
    const current = project.tags.map((t) => t.id);
    const next = current.includes(tagId)
      ? current.filter((id) => id !== tagId)
      : [...current, tagId];
    await setProjectTags(projectId, next);
    loadProject();
  }

  async function handleToggleCollection(collectionId: string) {
    if (!project) return;
    const isInCollection = project.collections.some((c) => c.id === collectionId);
    if (isInCollection) {
      await removeProjectFromCollection(projectId, collectionId);
    } else {
      await addProjectToCollection(projectId, collectionId);
    }
    loadProject();
  }

  async function handleDelete() {
    if (!project) return;
    setShowDeleteConfirm(true);
  }

  async function confirmDelete() {
    await deleteProject(projectId);
    onDeleted();
  }

  function getAssetForType(type: AssetType): Asset | undefined {
    return assets.find((a) => a.asset_type === type);
  }

  if (!project) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <div className="text-gray-400 animate-pulse">Loading...</div>
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col h-screen bg-white dark:bg-gray-900">
      {/* Top bar */}
      <div className="flex items-center gap-3 px-4 py-3 pt-10 border-b border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 shrink-0" onMouseDown={onDragMouseDown}>
        <button
          onClick={onBack}
          className="p-1.5 text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors cursor-pointer"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
        </button>

        {editingName ? (
          <input
            autoFocus
            value={nameInput}
            onChange={(e) => setNameInput(e.target.value)}
            onBlur={handleNameSave}
            onKeyDown={(e) => {
              if (e.key === "Enter") handleNameSave();
              if (e.key === "Escape") { setEditingName(false); setNameInput(project.name); }
            }}
            className="flex-1 text-lg font-semibold bg-transparent border-b-2 border-indigo-500 focus:outline-none text-gray-900 dark:text-gray-100"
          />
        ) : (
          <h1
            onClick={() => { setEditingName(true); setNameInput(project.name); }}
            className="flex-1 text-lg font-semibold text-gray-900 dark:text-gray-100 cursor-pointer hover:text-indigo-600 dark:hover:text-indigo-400 transition-colors"
          >
            {project.name}
          </h1>
        )}

        <button
          onClick={handleDelete}
          className="p-1.5 text-gray-400 hover:text-red-500 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors cursor-pointer"
          title="Delete project"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
          </svg>
        </button>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto">
        <div className="max-w-4xl mx-auto p-6 space-y-6">
          {/* Thumbnail + Tags row */}
          <div className="flex gap-6">
            {/* Thumbnail */}
            <div
              onClick={handleThumbnailChange}
              className="w-48 h-36 rounded-xl bg-gray-100 dark:bg-gray-800 border-2 border-dashed border-gray-300 dark:border-gray-600 overflow-hidden cursor-pointer hover:border-indigo-400 dark:hover:border-indigo-500 transition-colors flex items-center justify-center shrink-0 group"
            >
              {project.thumbnail_path ? (
                <img
                  src={convertFileSrc(project.thumbnail_path)}
                  alt={project.name}
                  className="w-full h-full object-cover group-hover:opacity-80 transition-opacity"
                />
              ) : (
                <div className="text-center text-gray-400 dark:text-gray-500">
                  <svg className="w-8 h-8 mx-auto mb-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                  </svg>
                  <span className="text-xs">Click to set</span>
                </div>
              )}
            </div>

            {/* Tags */}
            <div className="flex-1">
              <h3 className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-2">
                Tags
              </h3>
              <div className="flex flex-wrap gap-1.5">
                {allTags.map((tag) => {
                  const isActive = project.tags.some((t) => t.id === tag.id);
                  return (
                    <button
                      key={tag.id}
                      onClick={() => handleToggleTag(tag.id)}
                      className={`text-xs px-2.5 py-1 rounded-full transition-all cursor-pointer border ${
                        isActive
                          ? "ring-2 ring-offset-1 ring-indigo-400 font-medium"
                          : "opacity-50 hover:opacity-80"
                      }`}
                      style={{
                        backgroundColor: tag.color + (isActive ? "33" : "15"),
                        borderColor: tag.color,
                        color: tag.color,
                      }}
                    >
                      {tag.name}
                    </button>
                  );
                })}
                {allTags.length === 0 && (
                  <span className="text-xs text-gray-400 dark:text-gray-500">
                    No tags created yet
                  </span>
                )}
              </div>

              {/* Collections */}
              <div className="mt-3">
                <h3 className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-1">
                  Collections
                </h3>
                <div className="flex flex-wrap gap-1.5">
                  {allCollections.map((c) => {
                    const isIn = project.collections.some((pc) => pc.id === c.id);
                    return (
                      <button
                        key={c.id}
                        onClick={() => handleToggleCollection(c.id)}
                        className={`text-xs px-2.5 py-1 rounded-lg transition-all cursor-pointer border ${
                          isIn
                            ? "bg-indigo-50 dark:bg-indigo-900/30 border-indigo-300 dark:border-indigo-600 text-indigo-700 dark:text-indigo-300 font-medium"
                            : "bg-gray-50 dark:bg-gray-800 border-gray-200 dark:border-gray-700 text-gray-500 dark:text-gray-400 opacity-60 hover:opacity-100"
                        }`}
                      >
                        {isIn && <span className="mr-1">&#10003;</span>}
                        {c.name}
                      </button>
                    );
                  })}
                  {allCollections.length === 0 && (
                    <span className="text-xs text-gray-400 dark:text-gray-500">
                      No collections created yet
                    </span>
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* Notes */}
          <div>
            <h3 className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-2">
              Notes
            </h3>
            <MarkdownEditor
              value={project.description}
              onChange={handleDescriptionChange}
              onBlur={handleDescriptionBlur}
            />
          </div>

          {/* Asset sections */}
          <div>
            <h3 className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-3">
              Files & Revisions
            </h3>
            <div className="space-y-4">
              {ASSET_TYPES.map((type) => (
                <AssetSection
                  key={type}
                  assetType={type}
                  asset={getAssetForType(type)}
                  projectId={projectId}
                  onRefresh={loadProject}
                />
              ))}
            </div>
          </div>
        </div>
      </div>

      <ConfirmDialog
        open={showDeleteConfirm}
        title="Delete Project"
        message={`Delete "${project.name}"? This will remove all associated files and cannot be undone.`}
        confirmLabel="Delete"
        danger
        onConfirm={confirmDelete}
        onCancel={() => setShowDeleteConfirm(false)}
      />
    </div>
  );
}
