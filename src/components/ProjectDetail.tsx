import { useCallback, useEffect, useRef, useState } from "react";
import { convertFileSrc } from "@tauri-apps/api/core";
import {
  getProject,
  updateProject,
  deleteProject,
  setProjectThumbnail,
  getProjectFiles,
  syncProjectFiles,
  importFiles,
  listFolderFiles,
  setProjectTags,
  listTags,
  listCollections,
  getProjectFilamentsV2,
  matchProjectFilament,
  listCuratedFilaments,
  addProjectToCollection,
  removeProjectFromCollection,
  openFileWithApp,
  revealInFinder,
  duplicateProject,
  exportProject,
  createTag,
  createCollection,
  addManualProjectFilament,
  removeProjectFilament,
  resetProjectFilament,
} from "../lib/api";
import type { Project, ProjectFile, TagWithCount, Collection, FileMetadata, ProjectFilamentDisplay, CuratedFilament } from "../lib/types";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import FileList from "./FileList";
import ConfirmDialog from "./ConfirmDialog";
import { onDragMouseDown } from "../hooks/useDrag";
import { useFileDrop } from "../hooks/useFileDrop";
import { save } from "@tauri-apps/plugin-dialog";

interface ProjectDetailProps {
  projectId: string;
  onBack: () => void;
  onDeleted: () => void;
  onDuplicated?: (newId: string) => void;
  onFilterByFilaments?: (filamentIds: string[]) => void;
}

export default function ProjectDetail({ projectId, onBack, onDeleted, onDuplicated, onFilterByFilaments }: ProjectDetailProps) {
  const [project, setProject] = useState<Project | null>(null);
  const [files, setFiles] = useState<ProjectFile[]>([]);
  const [allTags, setAllTags] = useState<TagWithCount[]>([]);
  const [allCollections, setAllCollections] = useState<Collection[]>([]);
  const [editingName, setEditingName] = useState(false);
  const [nameInput, setNameInput] = useState("");
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [showDuplicateConfirm, setShowDuplicateConfirm] = useState(false);
  const [showMoreMenu, setShowMoreMenu] = useState(false);
  const [toast, setToast] = useState<{ message: string; type: "success" | "error" } | null>(null);
  const toastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const moreMenuRef = useRef<HTMLDivElement>(null);
  const [editingPrintInfo, setEditingPrintInfo] = useState(false);
  const [editWidth, setEditWidth] = useState("");
  const [editHeight, setEditHeight] = useState("");
  const [editTimeH, setEditTimeH] = useState("");
  const [editTimeM, setEditTimeM] = useState("");
  const [notesOpen, setNotesOpen] = useState(() => localStorage.getItem("notes-collapsed") !== "true");
  const [editingNotes, setEditingNotes] = useState(false);

  const [settingThumbnail, setSettingThumbnail] = useState(false);
  const [thumbKey, setThumbKey] = useState(0);
  const [previewFileId, setPreviewFileId] = useState<string | null>(null);
  const filesSectionRef = useRef<HTMLDivElement>(null);
  const [importingFiles, setImportingFiles] = useState(false);
  const [newTagName, setNewTagName] = useState("");
  const [showNewTag, setShowNewTag] = useState(false);
  const [newCollectionName, setNewCollectionName] = useState("");
  const [showNewCollection, setShowNewCollection] = useState(false);
  const [collectionsExpanded, setCollectionsExpanded] = useState(false);
  const [tagsExpanded, setTagsExpanded] = useState(false);

  const loadProject = useCallback(async (sync = false) => {
    if (sync) {
      await syncProjectFiles(projectId);
    }
    const [p, f, t, c] = await Promise.all([
      getProject(projectId),
      getProjectFiles(projectId),
      listTags(),
      listCollections(),
    ]);
    setProject(p);
    setFiles(f);
    setAllTags(t);
    setAllCollections(c);
    setNameInput(p.name);
  }, [projectId]);

  useEffect(() => {
    loadProject(true);
  }, [loadProject]);

  // Close more-actions menu on click outside
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (moreMenuRef.current && !moreMenuRef.current.contains(e.target as Node)) {
        setShowMoreMenu(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  async function handleNameSave() {
    if (!project || !nameInput.trim() || nameInput.trim() === project.name) {
      setEditingName(false);
      setNameInput(project?.name ?? "");
      return;
    }
    try {
      await updateProject(projectId, { name: nameInput.trim() });
      setEditingName(false);
      loadProject();
    } catch (err) {
      console.error("Failed to save name:", err);
    }
  }

  useEffect(() => {
    return () => {
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    };
  }, []);

  function handleDescriptionChange(value: string) {
    if (!project) return;
    setProject({ ...project, description: value });

    // Auto-save with debounce
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(async () => {
      try {
        await updateProject(projectId, { description: value });
      } catch (err) {
        console.error("Failed to save description:", err);
      }
    }, 800);
  }

  async function handleDescriptionBlur() {
    if (!project) return;
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    await updateProject(projectId, { description: project.description });
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

  async function handleCreateTag() {
    const name = newTagName.trim();
    if (!name || !project) return;
    try {
      const tag = await createTag(name);
      const currentIds = project.tags.map((t) => t.id);
      await setProjectTags(projectId, [...currentIds, tag.id]);
      setNewTagName("");
      setShowNewTag(false);
      loadProject();
    } catch (err) {
      console.error("Failed to create tag:", err);
    }
  }

  async function handleCreateCollection() {
    const name = newCollectionName.trim();
    if (!name || !project) return;
    try {
      const collection = await createCollection(name);
      await addProjectToCollection(projectId, collection.id);
      setNewCollectionName("");
      setShowNewCollection(false);
      loadProject();
    } catch (err) {
      console.error("Failed to create collection:", err);
    }
  }

  async function handleDelete() {
    if (!project) return;
    setShowDeleteConfirm(true);
  }

  async function confirmDelete() {
    await deleteProject(projectId);
    onDeleted();
  }

  function showToast(message: string, type: "success" | "error") {
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    setToast({ message, type });
    toastTimerRef.current = setTimeout(() => setToast(null), 3000);
  }

  async function handleExport() {
    if (!project) return;
    const safeName = project.name.replace(/[^a-zA-Z0-9_\- ]/g, "").trim() || "project";
    const destPath = await save({
      defaultPath: `${safeName}.hllmproject`,
      filters: [{ name: "HF Library Project", extensions: ["hllmproject"] }],
    });
    if (!destPath) return;
    const path = typeof destPath === "string" ? destPath : (destPath as { path: string }).path;
    if (!path) return;
    try {
      await exportProject(projectId, path);
      showToast("Project exported successfully", "success");
    } catch (e) {
      showToast(`Export failed: ${e}`, "error");
    }
  }

  // Handle file/folder drop into project
  const handleFileDrop = useCallback(async (paths: string[]) => {
    setImportingFiles(true);
    try {
      // Expand folders into file lists, keep individual files as-is
      const allFiles: string[] = [];
      for (const path of paths) {
        try {
          const folderFiles = await listFolderFiles(path);
          allFiles.push(...folderFiles);
        } catch {
          // Not a directory — treat as individual file
          allFiles.push(path);
        }
      }
      if (allFiles.length > 0) {
        await importFiles(projectId, allFiles);
        await loadProject();
      }
    } finally {
      setImportingFiles(false);
    }
  }, [projectId, loadProject]);

  const { isDragging } = useFileDrop(handleFileDrop);

  // Project filaments from the new curated system
  const [projectFilaments, setProjectFilaments] = useState<ProjectFilamentDisplay[]>([]);
  const [curatedFilaments, setCuratedFilaments] = useState<CuratedFilament[]>([]);
  const [thumbnailPreview, setThumbnailPreview] = useState(false);
  const [editingFilaments, setEditingFilaments] = useState(false);
  const [filamentSearch, setFilamentSearch] = useState("");
  const [changingFilamentId, setChangingFilamentId] = useState<string | null>(null);
  const [changingSearch, setChangingSearch] = useState("");
  const filamentSearchRef = useRef<HTMLInputElement>(null);
  const changingSearchRef = useRef<HTMLInputElement>(null);
  const clickedRef = useRef(false);

  useEffect(() => {
    let cancelled = false;
    getProjectFilamentsV2(projectId).then(data => { if (!cancelled) setProjectFilaments(data); }).catch(() => {});
    listCuratedFilaments().then(data => { if (!cancelled) setCuratedFilaments(data); }).catch(() => {});
    return () => { cancelled = true; };
  }, [projectId, files]);


  // Aggregate metadata from favorited files for dimensions
  const favoritedMeta: FileMetadata[] = files
    .filter(f => f.favorited)
    .map(f => {
      try { return JSON.parse(f.metadata) as FileMetadata; }
      catch { return {} as FileMetadata; }
    })
    .filter(m => m.width_mm || m.height_mm);

  // Get dimensions from first file that has them
  const dimsSource = favoritedMeta.find(m => m.width_mm || m.height_mm);
  if (!project) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <div className="text-gray-400 animate-pulse">Loading...</div>
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col h-screen bg-white dark:bg-gray-900 relative">
      {/* Drop overlay */}
      {isDragging && (
        <div className="absolute inset-0 bg-indigo-500/10 border-2 border-dashed border-indigo-400 rounded-lg flex items-center justify-center z-40 pointer-events-none">
          <div className="bg-white dark:bg-gray-800 rounded-xl shadow-xl px-8 py-6 text-center">
            <svg className="w-12 h-12 mx-auto text-indigo-500 mb-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
            </svg>
            <p className="text-lg font-semibold text-indigo-600 dark:text-indigo-400">Drop to import files</p>
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">Files and folders will be added to this project</p>
          </div>
        </div>
      )}

      {/* Import loading overlay */}
      {importingFiles && (
        <div className="absolute inset-0 bg-white/80 dark:bg-gray-900/80 flex items-center justify-center z-50">
          <div className="text-center">
            <svg className="w-10 h-10 mx-auto text-indigo-500 animate-spin mb-3" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
            </svg>
            <p className="text-sm font-medium text-gray-700 dark:text-gray-300">Importing files...</p>
          </div>
        </div>
      )}

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
          onClick={() => {
            const filePath = files[0]?.file_path;
            if (filePath) revealInFinder(filePath);
          }}
          className="p-1.5 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors cursor-pointer"
          title="Open project folder"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
          </svg>
        </button>

        {/* More actions menu */}
        <div className="relative" ref={moreMenuRef}>
          <button
            onClick={() => setShowMoreMenu(v => !v)}
            className="p-1.5 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors cursor-pointer"
            title="More actions"
          >
            <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
              <circle cx="12" cy="5" r="1.5" />
              <circle cx="12" cy="12" r="1.5" />
              <circle cx="12" cy="19" r="1.5" />
            </svg>
          </button>
          {showMoreMenu && (
            <div className="absolute right-0 top-full mt-1 w-44 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-600 rounded-lg shadow-lg z-30 py-1">
              <button
                onClick={() => { setShowMoreMenu(false); setShowDuplicateConfirm(true); }}
                className="w-full flex items-center gap-2 px-3 py-2 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 cursor-pointer transition-colors"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                </svg>
                Duplicate
              </button>
              <button
                onClick={() => { setShowMoreMenu(false); handleExport(); }}
                className="w-full flex items-center gap-2 px-3 py-2 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 cursor-pointer transition-colors"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                </svg>
                Export
              </button>
              <button
                onClick={() => { setShowMoreMenu(false); handleDelete(); }}
                className="w-full flex items-center gap-2 px-3 py-2 text-sm text-red-500 hover:bg-gray-100 dark:hover:bg-gray-700 cursor-pointer transition-colors"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                </svg>
                Delete
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto">
        <div className="w-[80%] mx-auto p-6 space-y-6">
          {/* Thumbnail + Tags row */}
          <div className="flex gap-6">
            {/* Thumbnail */}
            <div
              onClick={project.thumbnail_path ? () => setThumbnailPreview(true) : undefined}
              className={`w-48 h-36 rounded-xl bg-gray-100 dark:bg-gray-800 border border-gray-300 dark:border-gray-600 overflow-hidden flex items-center justify-center shrink-0 group relative ${project.thumbnail_path ? "cursor-pointer hover:border-indigo-400 dark:hover:border-indigo-500 transition-colors" : ""}`}
            >
              {project.thumbnail_path ? (
                <img
                  src={convertFileSrc(project.thumbnail_path) + "?v=" + thumbKey}
                  alt={project.name}
                  className="w-full h-full object-cover group-hover:opacity-80 transition-opacity"
                />
              ) : (
                <div className="text-center text-gray-400 dark:text-gray-500">
                  <svg className="w-8 h-8 mx-auto mb-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                  </svg>
                  <span className="text-xs">Set from files</span>
                </div>
              )}
              {settingThumbnail && (
                <div className="absolute inset-0 bg-white/70 dark:bg-gray-800/70 flex items-center justify-center rounded-xl">
                  <svg className="w-6 h-6 text-indigo-500 animate-spin" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                  </svg>
                </div>
              )}
            </div>

            {/* Collections + Tags */}
            <div className="flex-1 min-w-0">
              {/* Collections */}
              <div className="mb-3">
                <div className="flex items-center gap-2 mb-1">
                  <button onClick={() => setCollectionsExpanded(!collectionsExpanded)} className="flex items-center gap-1 cursor-pointer group">
                    <svg
                      className={`w-3 h-3 text-gray-400 dark:text-gray-500 transition-transform ${collectionsExpanded ? "rotate-90" : ""}`}
                      fill="none" stroke="currentColor" viewBox="0 0 24 24"
                    >
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                    </svg>
                    <h3 className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider group-hover:text-gray-700 dark:group-hover:text-gray-300 transition-colors">
                      Collections
                    </h3>
                  </button>
                  {collectionsExpanded && !showNewCollection && (
                    <button
                      onClick={() => setShowNewCollection(true)}
                      className="text-gray-400 hover:text-indigo-500 cursor-pointer"
                      title="Create new collection"
                    >
                      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
                      </svg>
                    </button>
                  )}
                </div>
                {collectionsExpanded ? (
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
                    {showNewCollection && (
                      <input
                        autoFocus
                        value={newCollectionName}
                        onChange={(e) => setNewCollectionName(e.target.value)}
                        onBlur={() => { if (!newCollectionName.trim()) setShowNewCollection(false); }}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") handleCreateCollection();
                          if (e.key === "Escape") { setShowNewCollection(false); setNewCollectionName(""); }
                        }}
                        placeholder="Collection name..."
                        className="text-xs px-2.5 py-1 rounded-lg border border-indigo-400 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-indigo-400 w-32"
                      />
                    )}
                    {allCollections.length === 0 && !showNewCollection && (
                      <span className="text-xs text-gray-400 dark:text-gray-500">
                        No collections created yet
                      </span>
                    )}
                  </div>
                ) : (
                  <div className="flex flex-wrap gap-1.5">
                    {project.collections.length > 0 ? project.collections.map((c) => (
                      <span
                        key={c.id}
                        className="text-xs px-2.5 py-1 rounded-lg border bg-indigo-50 dark:bg-indigo-900/30 border-indigo-300 dark:border-indigo-600 text-indigo-700 dark:text-indigo-300 font-medium"
                      >
                        {c.name}
                      </span>
                    )) : (
                      <span className="text-xs text-gray-400 dark:text-gray-500 italic">None</span>
                    )}
                  </div>
                )}
              </div>

              {/* Tags */}
              <div>
                <div className="flex items-center gap-2 mb-2">
                  <button onClick={() => setTagsExpanded(!tagsExpanded)} className="flex items-center gap-1 cursor-pointer group">
                    <svg
                      className={`w-3 h-3 text-gray-400 dark:text-gray-500 transition-transform ${tagsExpanded ? "rotate-90" : ""}`}
                      fill="none" stroke="currentColor" viewBox="0 0 24 24"
                    >
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                    </svg>
                    <h3 className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider group-hover:text-gray-700 dark:group-hover:text-gray-300 transition-colors">
                      Tags
                    </h3>
                  </button>
                  {tagsExpanded && !showNewTag && (
                    <button
                      onClick={() => setShowNewTag(true)}
                      className="text-gray-400 hover:text-indigo-500 cursor-pointer"
                      title="Create new tag"
                    >
                      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
                      </svg>
                    </button>
                  )}
                </div>
                {tagsExpanded ? (
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
                    {showNewTag && (
                      <input
                        autoFocus
                        value={newTagName}
                        onChange={(e) => setNewTagName(e.target.value)}
                        onBlur={() => { if (!newTagName.trim()) setShowNewTag(false); }}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") handleCreateTag();
                          if (e.key === "Escape") { setShowNewTag(false); setNewTagName(""); }
                        }}
                        placeholder="Tag name..."
                        className="text-xs px-2.5 py-1 rounded-full border border-indigo-400 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-indigo-400 w-24"
                      />
                    )}
                    {allTags.length === 0 && !showNewTag && (
                      <span className="text-xs text-gray-400 dark:text-gray-500">
                        No tags created yet
                      </span>
                    )}
                  </div>
                ) : (
                  <div className="flex flex-wrap gap-1.5">
                    {project.tags.length > 0 ? project.tags.map((tag) => (
                      <span
                        key={tag.id}
                        className="text-xs px-2.5 py-1 rounded-full border"
                        style={{
                          backgroundColor: tag.color + "33",
                          borderColor: tag.color,
                          color: tag.color,
                        }}
                      >
                        {tag.name}
                      </span>
                    )) : (
                      <span className="text-xs text-gray-400 dark:text-gray-500 italic">None</span>
                    )}
                  </div>
                )}
              </div>

            </div>

            {/* Quick Open buttons */}
            {(() => {
              const starred = files.filter(f => f.favorited);
              const AFFINITY_EXTS = new Set(["af", "afdesign", "afphoto", "afpub"]);
              const getExt = (name: string) => name.split(".").pop()?.toLowerCase() ?? "";
              const hfpFiles = starred.filter(f => getExt(f.original_filename) === "hfp");
              const afFiles = starred.filter(f => AFFINITY_EXTS.has(getExt(f.original_filename)));
              const threemfFiles = starred.filter(f => getExt(f.original_filename) === "3mf");
              if (hfpFiles.length !== 1 && afFiles.length !== 1 && threemfFiles.length !== 1) return null;
              return (
                <div className="flex flex-col gap-2 shrink-0 ml-auto">
                  {threemfFiles.length === 1 && (
                    <button
                      onClick={() => openFileWithApp(threemfFiles[0].file_path, "BambuStudio")}
                      className="flex items-center gap-1.5 text-xs font-medium px-3 py-2 rounded-lg bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-400 border border-green-200 dark:border-green-800 hover:bg-green-100 dark:hover:bg-green-900/40 cursor-pointer transition-colors"
                    >
                      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                      </svg>
                      Open in Bambu Studio
                    </button>
                  )}
                  {hfpFiles.length === 1 && (
                    <button
                      onClick={() => openFileWithApp(hfpFiles[0].file_path, "HueForge")}
                      className="flex items-center gap-1.5 text-xs font-medium px-3 py-2 rounded-lg bg-orange-50 dark:bg-orange-900/20 text-orange-700 dark:text-orange-400 border border-orange-200 dark:border-orange-800 hover:bg-orange-100 dark:hover:bg-orange-900/40 cursor-pointer transition-colors"
                    >
                      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                      </svg>
                      Open in HueForge
                    </button>
                  )}
                  {afFiles.length === 1 && (
                    <button
                      onClick={() => openFileWithApp(afFiles[0].file_path, "Affinity Designer 2")}
                      className="flex items-center gap-1.5 text-xs font-medium px-3 py-2 rounded-lg bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-400 border border-blue-200 dark:border-blue-800 hover:bg-blue-100 dark:hover:bg-blue-900/40 cursor-pointer transition-colors"
                    >
                      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                      </svg>
                      Open in Affinity
                    </button>
                  )}
                </div>
              );
            })()}
          </div>

          {/* HueForge Info */}
          <div className="rounded-lg border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50 p-4">
            <div className="flex flex-wrap gap-6">
              {/* Filaments */}
              <div className="w-full">
                    <div className="flex items-center gap-2 mb-2">
                      <h3 className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                        Filaments ({projectFilaments.length})
                      </h3>
                      <button
                        onClick={() => { setEditingFilaments(!editingFilaments); setFilamentSearch(""); setChangingFilamentId(null); setChangingSearch(""); }}
                        className={`text-[10px] w-5 h-5 flex items-center justify-center rounded border cursor-pointer transition-colors ${
                          editingFilaments
                            ? "border-indigo-400 dark:border-indigo-500 text-indigo-500 dark:text-indigo-400 bg-indigo-50 dark:bg-indigo-900/30"
                            : "border-gray-300 dark:border-gray-600 text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700"
                        }`}
                        title={editingFilaments ? "Done editing" : "Edit filaments"}
                      >
                        <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                        </svg>
                      </button>
                      {!editingFilaments && onFilterByFilaments && projectFilaments.length > 1 && (
                        <button
                          onClick={() => onFilterByFilaments(
                            projectFilaments
                              .filter(pf => pf.curated_filament_id)
                              .map(pf => pf.curated_filament_id!)
                          )}
                          className="text-[10px] px-1.5 py-0.5 rounded border border-indigo-300 dark:border-indigo-600 text-indigo-600 dark:text-indigo-400 hover:bg-indigo-50 dark:hover:bg-indigo-900/30 cursor-pointer transition-colors"
                        >
                          Filter all
                        </button>
                      )}
                    </div>

                    {editingFilaments ? (
                      /* ── Edit mode: table view ── */
                      <div className="space-y-1">
                        {projectFilaments.map((pf) => (
                          <div
                            key={pf.project_filament_id}
                            className="flex items-center gap-2 text-xs py-1.5 px-2 rounded-lg bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-600"
                          >
                            {/* Color swatch */}
                            <div
                              className={`w-4 h-4 rounded-full shrink-0 ${
                                pf.match_status === "unmatched"
                                  ? "border-2 border-gray-400 dark:border-gray-500"
                                  : pf.match_status === "guessed"
                                    ? "border-2 border-dashed border-gray-300 dark:border-gray-500"
                                    : "border border-gray-300 dark:border-gray-500"
                              }`}
                              style={{ backgroundColor: pf.match_status === "unmatched" ? (pf.parsed_color || "#9ca3af") : pf.color }}
                            >
                              {pf.match_status === "unmatched" && !pf.parsed_color && (
                                <span className="text-[8px] font-bold text-white flex items-center justify-center h-full">?</span>
                              )}
                            </div>

                            {/* Name / change match */}
                            <div className="flex-1 min-w-0">
                              {changingFilamentId === pf.project_filament_id ? (
                                <div>
                                  <input
                                    ref={changingSearchRef}
                                    type="text"
                                    value={changingSearch}
                                    onChange={(e) => setChangingSearch(e.target.value)}
                                    onBlur={() => { if (!clickedRef.current) { setChangingFilamentId(null); setChangingSearch(""); } }}
                                    onKeyDown={(e) => {
                                      if (e.key === "Escape") { setChangingFilamentId(null); setChangingSearch(""); }
                                    }}
                                    placeholder="Search filament..."
                                    className="w-full text-xs px-2 py-1 border border-indigo-300 dark:border-indigo-600 rounded bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 focus:outline-none focus:ring-1 focus:ring-indigo-400"
                                    autoFocus
                                  />
                                  {(() => {
                                    const q = changingSearch.toLowerCase();
                                    const filtered = q ? curatedFilaments.filter(cf =>
                                      `${cf.brand} ${cf.line} ${cf.name}`.toLowerCase().includes(q)
                                    ).slice(0, 8) : curatedFilaments.slice(0, 8);
                                    return filtered.length > 0 && (
                                      <div className="mt-1 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-600 rounded-lg shadow-lg max-h-48 overflow-y-auto">
                                        {filtered.map(cf => (
                                          <button
                                            key={cf.id}
                                            onMouseDown={() => { clickedRef.current = true; }}
                                            onClick={async () => {
                                              clickedRef.current = false;
                                              await matchProjectFilament(pf.project_filament_id, cf.id);
                                              const updated = await getProjectFilamentsV2(projectId);
                                              setProjectFilaments(updated);
                                              setChangingFilamentId(null);
                                              setChangingSearch("");
                                            }}
                                            className="w-full flex items-center gap-2 px-2 py-1.5 text-xs text-left hover:bg-indigo-50 dark:hover:bg-indigo-900/30 cursor-pointer transition-colors"
                                          >
                                            <div
                                              className="w-3 h-3 rounded-full shrink-0 border border-gray-300 dark:border-gray-500"
                                              style={{ backgroundColor: cf.color || "#9ca3af" }}
                                            />
                                            <span className="text-gray-700 dark:text-gray-300 truncate">
                                              {cf.brand} {cf.line ? cf.line + " " : ""}{cf.name}
                                            </span>
                                          </button>
                                        ))}
                                      </div>
                                    );
                                  })()}
                                </div>
                              ) : (
                                <button
                                  onClick={() => { setChangingFilamentId(pf.project_filament_id); setChangingSearch(""); }}
                                  className="text-left truncate w-full cursor-pointer hover:text-indigo-600 dark:hover:text-indigo-400 transition-colors"
                                >
                                  {pf.match_status === "unmatched" ? (
                                    <span className="text-gray-400 dark:text-gray-500">{pf.parsed_brand} {pf.parsed_name}</span>
                                  ) : (
                                    <span className="text-gray-700 dark:text-gray-300">
                                      {pf.brand} {pf.line ? pf.line + " " : ""}{pf.name}
                                    </span>
                                  )}
                                </button>
                              )}
                            </div>

                            {/* Match status badge */}
                            <span className={`text-[10px] px-1.5 py-0.5 rounded shrink-0 ${
                              pf.match_status === "unmatched" ? "bg-amber-100 dark:bg-amber-900/30 text-amber-600 dark:text-amber-400" :
                              pf.match_status === "guessed" ? "bg-yellow-100 dark:bg-yellow-900/30 text-yellow-600 dark:text-yellow-400" :
                              pf.is_manual ? "bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400" :
                              "bg-green-100 dark:bg-green-900/30 text-green-600 dark:text-green-400"
                            }`}>
                              {pf.is_manual ? "manual" : pf.match_status}
                            </span>

                            {/* Quick confirm button for guessed filaments */}
                            {pf.match_status === "guessed" && pf.curated_filament_id ? (
                              <button
                                onClick={async () => {
                                  await matchProjectFilament(pf.project_filament_id, pf.curated_filament_id!);
                                  const updated = await getProjectFilamentsV2(projectId);
                                  setProjectFilaments(updated);
                                }}
                                className="text-[10px] w-5 h-5 flex items-center justify-center rounded border border-green-300 dark:border-green-600 text-green-500 dark:text-green-400 hover:bg-green-100 dark:hover:bg-green-900/30 cursor-pointer transition-colors shrink-0"
                                title="Confirm match"
                              >
                                <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                                </svg>
                              </button>
                            ) : (
                              <div className="w-5 shrink-0" />
                            )}

                            {/* Reset button (non-manual parsed filaments only) */}
                            {!pf.is_manual && pf.match_status !== "unmatched" ? (
                              <button
                                onClick={async () => {
                                  await resetProjectFilament(pf.project_filament_id);
                                  const updated = await getProjectFilamentsV2(projectId);
                                  setProjectFilaments(updated);
                                }}
                                className="text-[10px] w-5 h-5 flex items-center justify-center rounded border border-gray-300 dark:border-gray-600 text-gray-400 dark:text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-700 cursor-pointer transition-colors shrink-0"
                                title="Reset to auto-match"
                              >
                                &#8634;
                              </button>
                            ) : (
                              <div className="w-5 shrink-0" />
                            )}

                            {/* Remove button */}
                            <button
                              onClick={async () => {
                                await removeProjectFilament(pf.project_filament_id);
                                const updated = await getProjectFilamentsV2(projectId);
                                setProjectFilaments(updated);
                              }}
                              className="text-[10px] w-5 h-5 flex items-center justify-center rounded border border-gray-300 dark:border-gray-600 text-gray-400 dark:text-gray-500 hover:bg-red-100 dark:hover:bg-red-900/30 hover:text-red-500 dark:hover:text-red-400 cursor-pointer transition-colors shrink-0"
                              title="Remove filament"
                            >
                              &times;
                            </button>
                          </div>
                        ))}

                        {/* Add filament row */}
                        <div className="mt-2">
                          <input
                            ref={filamentSearchRef}
                            type="text"
                            value={filamentSearch}
                            onChange={(e) => setFilamentSearch(e.target.value)}
                            onBlur={() => { if (!clickedRef.current) setFilamentSearch(""); }}
                            onKeyDown={(e) => {
                              if (e.key === "Escape") setFilamentSearch("");
                            }}
                            placeholder="Search to add filament..."
                            className="w-full text-xs px-2 py-1.5 border border-dashed border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 focus:outline-none focus:ring-1 focus:ring-indigo-400 focus:border-indigo-400"
                          />
                          {filamentSearch.length > 0 && (() => {
                            const q = filamentSearch.toLowerCase();
                            const filtered = curatedFilaments.filter(cf =>
                              `${cf.brand} ${cf.line} ${cf.name}`.toLowerCase().includes(q)
                            ).slice(0, 8);
                            return filtered.length > 0 && (
                              <div className="mt-1 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-600 rounded-lg max-h-48 overflow-y-auto">
                                {filtered.map(cf => (
                                  <button
                                    key={cf.id}
                                    onMouseDown={() => { clickedRef.current = true; }}
                                    onClick={async () => {
                                      clickedRef.current = false;
                                      await addManualProjectFilament(projectId, cf.id);
                                      const updated = await getProjectFilamentsV2(projectId);
                                      setProjectFilaments(updated);
                                      setFilamentSearch("");
                                    }}
                                    className="w-full flex items-center gap-2 px-2 py-1.5 text-xs text-left hover:bg-indigo-50 dark:hover:bg-indigo-900/30 cursor-pointer transition-colors"
                                  >
                                    <div
                                      className="w-3 h-3 rounded-full shrink-0 border border-gray-300 dark:border-gray-500"
                                      style={{ backgroundColor: cf.color || "#9ca3af" }}
                                    />
                                    <span className="text-gray-700 dark:text-gray-300 truncate">
                                      {cf.brand} {cf.line ? cf.line + " " : ""}{cf.name}
                                    </span>
                                  </button>
                                ))}
                              </div>
                            );
                          })()}
                        </div>
                      </div>
                    ) : projectFilaments.length > 0 ? (
                      /* ── Normal view: clean pills ── */
                      <div className="flex flex-wrap gap-2">
                        {projectFilaments.map((pf) => (
                          <button
                            key={pf.project_filament_id}
                            onClick={() => {
                              if (pf.curated_filament_id) onFilterByFilaments?.([pf.curated_filament_id]);
                            }}
                            className="flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded-lg border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-800 cursor-pointer hover:border-indigo-300 dark:hover:border-indigo-600 transition-colors"
                          >
                            <div
                              className={`w-4 h-4 rounded-full shrink-0 ${
                                pf.match_status === "unmatched"
                                  ? "border-2 border-gray-400 dark:border-gray-500"
                                  : pf.match_status === "guessed"
                                    ? "border-2 border-dashed border-gray-300 dark:border-gray-500"
                                    : "border border-gray-300 dark:border-gray-500"
                              }`}
                              style={{ backgroundColor: pf.match_status === "unmatched" ? (pf.parsed_color || "#9ca3af") : pf.color }}
                            >
                              {pf.match_status === "unmatched" && !pf.parsed_color && (
                                <span className="text-[8px] font-bold text-white flex items-center justify-center h-full">?</span>
                              )}
                            </div>
                            <span className={pf.match_status === "unmatched" ? "text-gray-400 dark:text-gray-500" : "text-gray-700 dark:text-gray-300"}>
                              {pf.match_status === "unmatched"
                                ? `${pf.parsed_brand} ${pf.parsed_name}`
                                : `${pf.brand} ${pf.line ? pf.line + " " : ""}${pf.name}`
                              }
                            </span>
                          </button>
                        ))}
                      </div>
                    ) : (
                      <p className="text-xs text-gray-400 dark:text-gray-500 italic">No filaments</p>
                    )}
                  </div>

                {/* Print Info */}
                {(() => {
                  const w = project.print_width_mm ?? dimsSource?.width_mm ?? null;
                  const h = project.print_height_mm ?? dimsSource?.height_mm ?? null;
                  const t = project.print_time_mins;
                  return (
                    <div>
                      <div className="flex items-center gap-2 mb-2">
                        <h3 className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                          Print Info
                        </h3>
                        <button
                          onClick={() => {
                            if (editingPrintInfo) {
                              setEditingPrintInfo(false);
                            } else {
                              setEditWidth(w != null ? w.toFixed(1) : "");
                              setEditHeight(h != null ? h.toFixed(1) : "");
                              setEditTimeH(t != null ? String(Math.floor(t / 60)) : "");
                              setEditTimeM(t != null ? String(t % 60) : "");
                              setEditingPrintInfo(true);
                            }
                          }}
                          className={`text-[10px] w-5 h-5 flex items-center justify-center rounded border cursor-pointer transition-colors ${
                            editingPrintInfo
                              ? "border-indigo-400 dark:border-indigo-500 text-indigo-500 dark:text-indigo-400 bg-indigo-50 dark:bg-indigo-900/30"
                              : "border-gray-300 dark:border-gray-600 text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700"
                          }`}
                          title={editingPrintInfo ? "Done editing" : "Edit print info"}
                        >
                          <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                          </svg>
                        </button>
                      </div>
                      {editingPrintInfo ? (
                        <div className="flex flex-wrap items-center gap-3 text-xs">
                          <div className="flex items-center gap-1">
                            <span className="text-gray-400 dark:text-gray-500">Size</span>
                            <input
                              type="number"
                              step="0.1"
                              value={editWidth}
                              onChange={(e) => setEditWidth(e.target.value)}
                              placeholder="W"
                              className="w-16 px-1.5 py-1 rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 text-xs"
                            />
                            <span className="text-gray-400">x</span>
                            <input
                              type="number"
                              step="0.1"
                              value={editHeight}
                              onChange={(e) => setEditHeight(e.target.value)}
                              placeholder="H"
                              className="w-16 px-1.5 py-1 rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 text-xs"
                            />
                            <span className="text-gray-400">mm</span>
                          </div>
                          <div className="flex items-center gap-1">
                            <span className="text-gray-400 dark:text-gray-500">Time</span>
                            <input
                              type="number"
                              min="0"
                              value={editTimeH}
                              onChange={(e) => setEditTimeH(e.target.value)}
                              placeholder="0"
                              className="w-12 px-1.5 py-1 rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 text-xs"
                            />
                            <span className="text-gray-400">h</span>
                            <input
                              type="number"
                              min="0"
                              max="59"
                              value={editTimeM}
                              onChange={(e) => setEditTimeM(e.target.value)}
                              placeholder="0"
                              className="w-12 px-1.5 py-1 rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 text-xs"
                            />
                            <span className="text-gray-400">min</span>
                          </div>
                          <button
                            onClick={async () => {
                              const pw = editWidth.trim() !== "" ? parseFloat(editWidth) : null;
                              const ph = editHeight.trim() !== "" ? parseFloat(editHeight) : null;
                              const hasTime = editTimeH.trim() !== "" || editTimeM.trim() !== "";
                              const totalMins = hasTime ? (parseInt(editTimeH || "0") * 60 + parseInt(editTimeM || "0")) : null;
                              await updateProject(projectId, {
                                print_width_mm: pw !== null && !isNaN(pw) ? pw : null,
                                print_height_mm: ph !== null && !isNaN(ph) ? ph : null,
                                print_time_mins: totalMins,
                              });
                              const p = await getProject(projectId);
                              setProject(p);
                              setEditingPrintInfo(false);
                            }}
                            className="px-2 py-1 text-xs bg-indigo-500 text-white rounded hover:bg-indigo-600 cursor-pointer transition-colors"
                          >
                            Save
                          </button>
                          <button
                            onClick={async () => {
                              await updateProject(projectId, {
                                print_width_mm: null,
                                print_height_mm: null,
                                print_time_mins: null,
                              });
                              const p = await getProject(projectId);
                              setProject(p);
                              setEditingPrintInfo(false);
                            }}
                            className="px-2 py-1 text-xs text-red-400 hover:text-red-500 cursor-pointer transition-colors"
                          >
                            Clear
                          </button>
                        </div>
                      ) : (w != null || t != null) ? (
                        <div className="flex flex-wrap gap-3 text-xs">
                          {w != null && h != null ? (
                            <div className="px-2.5 py-1.5 rounded-lg border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300">
                              <span className="text-gray-400 dark:text-gray-500">Size </span>
                              {w.toFixed(1)} x {h.toFixed(1)} mm
                            </div>
                          ) : null}
                          {t != null ? (
                            <div className="px-2.5 py-1.5 rounded-lg border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300">
                              <span className="text-gray-400 dark:text-gray-500">Time </span>
                              {Math.floor(t / 60)}h {t % 60}min
                            </div>
                          ) : null}
                        </div>
                      ) : (
                        <p className="text-xs text-gray-400 dark:text-gray-500 italic">No info</p>
                      )}
                    </div>
                  );
                })()}
              </div>

            {/* Notes */}
            <div className="mt-3 border-t border-gray-200 dark:border-gray-700 pt-3">
              <div className="flex items-center gap-2 mb-1">
                <button
                  onClick={() => {
                    const next = !notesOpen;
                    setNotesOpen(next);
                    localStorage.setItem("notes-collapsed", next ? "false" : "true");
                  }}
                  className="flex items-center gap-1.5 cursor-pointer group"
                >
                  <svg
                    className={`w-3 h-3 text-gray-400 dark:text-gray-500 transition-transform ${notesOpen ? "rotate-90" : ""}`}
                    fill="none" stroke="currentColor" viewBox="0 0 24 24"
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                  </svg>
                  <h3 className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider group-hover:text-gray-700 dark:group-hover:text-gray-300 transition-colors">
                    Notes
                  </h3>
                </button>
                {notesOpen && (
                  <button
                    onClick={() => setEditingNotes(!editingNotes)}
                    className={`p-1 rounded transition-colors cursor-pointer ${
                      editingNotes
                        ? "text-indigo-500 dark:text-indigo-400 bg-indigo-50 dark:bg-indigo-900/30"
                        : "text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300"
                    }`}
                    title={editingNotes ? "Done editing" : "Edit notes"}
                  >
                    <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                    </svg>
                  </button>
                )}
              </div>
              {notesOpen && (
                editingNotes ? (
                  <textarea
                    value={project.description}
                    onChange={(e) => handleDescriptionChange(e.target.value)}
                    onBlur={handleDescriptionBlur}
                    placeholder="Write notes in Markdown..."
                    className="w-full min-h-[120px] p-3 text-xs bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 border border-gray-200 dark:border-gray-600 rounded-lg resize-y focus:outline-none focus:ring-1 focus:ring-indigo-400 font-mono"
                    autoFocus
                  />
                ) : project.description ? (
                  <div className="prose prose-sm dark:prose-invert max-w-none text-xs [&_h1]:text-base [&_h2]:text-sm [&_h3]:text-xs [&_h3]:font-bold [&_p]:text-xs [&_li]:text-xs [&_ul]:my-1 [&_ol]:my-1 [&_p]:my-1 [&_h1]:my-1 [&_h2]:my-1 [&_h3]:my-1">
                    <ReactMarkdown remarkPlugins={[remarkGfm]}>{project.description}</ReactMarkdown>
                  </div>
                ) : null
              )}
            </div>
          </div>

          {/* Files */}
          <div ref={filesSectionRef}>
            <FileList
              files={files}
              projectId={projectId}
              onRefresh={loadProject}
              openPreviewFileId={previewFileId}
              onPreviewChange={setPreviewFileId}
              onSetThumbnail={async (filePath) => {
                setSettingThumbnail(true);
                try {
                  await setProjectThumbnail(projectId, filePath);
                  setThumbKey((k) => k + 1);
                  await loadProject();
                } finally {
                  setSettingThumbnail(false);
                }
              }}
            />
          </div>
        </div>
      </div>

      <ConfirmDialog
        open={showDuplicateConfirm}
        title="Duplicate Project"
        message={`Duplicate "${project.name}"? This will create a copy of the project with all its files.`}
        confirmLabel="Duplicate"
        onConfirm={async () => {
          setShowDuplicateConfirm(false);
          const dup = await duplicateProject(projectId);
          onDuplicated?.(dup.id);
        }}
        onCancel={() => setShowDuplicateConfirm(false)}
      />

      <ConfirmDialog
        open={showDeleteConfirm}
        title="Delete Project"
        message={`Delete "${project.name}"? This will remove all associated files and cannot be undone.`}
        confirmLabel="Delete"
        danger
        onConfirm={confirmDelete}
        onCancel={() => setShowDeleteConfirm(false)}
      />

      {/* Thumbnail preview modal — show original image, not the resized thumbnail */}
      {thumbnailPreview && project.thumbnail_path && (() => {
        const IMAGE_EXTS = new Set(["png", "jpg", "jpeg", "webp", "gif", "bmp", "tiff", "svg"]);
        const starredImages = files
          .filter(f => f.favorited && IMAGE_EXTS.has(f.original_filename.split(".").pop()?.toLowerCase() ?? ""));
        const originalSrc = starredImages.length > 0
          ? convertFileSrc(starredImages[0].file_path)
          : convertFileSrc(project.thumbnail_path) + "?v=" + thumbKey;
        return (
          <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 cursor-pointer"
            onClick={() => setThumbnailPreview(false)}
          >
            <img
              src={originalSrc}
              alt={project.name}
              className="max-w-[90vw] max-h-[90vh] object-contain rounded-lg shadow-2xl"
              onClick={(e) => e.stopPropagation()}
            />
          </div>
        );
      })()}

      {/* Toast notification */}
      {toast && (
        <div className={`fixed bottom-6 right-6 z-50 px-4 py-2.5 rounded-lg shadow-lg text-sm font-medium transition-all ${
          toast.type === "error"
            ? "bg-red-500 text-white"
            : "bg-green-600 text-white"
        }`}>
          {toast.message}
        </div>
      )}
    </div>
  );
}
