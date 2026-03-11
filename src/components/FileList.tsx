import { useEffect, useMemo, useRef, useState } from "react";
import { convertFileSrc } from "@tauri-apps/api/core";
import { open } from "@tauri-apps/plugin-dialog";
import {
  importFiles,
  deleteFile,
  updateFileNotes,
  toggleFileFavorite,
  revealInFinder,
  readTextFile,
  syncProjectFiles,
  openFileWithApp,
} from "../lib/api";
import type { ProjectFile } from "../lib/types";
import { formatFileSize, formatDate } from "../lib/formatting";
import ConfirmDialog from "./ConfirmDialog";

// ── File grouping ──

const IMAGE_EXTS = new Set(["png", "jpg", "jpeg", "webp", "gif", "bmp", "tiff", "svg", "af", "afdesign", "afphoto", "afpub", "psd", "ai", "xcf", "kra"]);
const HUEFORGE_EXTS = new Set(["hfp", "hfm"]);
const HUEFORGE_EXPORT_EXTS = new Set(["stl", "txt"]);
const PRINT_EXTS = new Set(["3mf"]);

const PREVIEW_IMAGE_EXTS = new Set(["png", "jpg", "jpeg", "webp", "gif", "bmp", "svg"]);
const PREVIEW_TEXT_EXTS = new Set(["txt"]);

type FileGroup = "design" | "hueforge" | "hueforge_export" | "print" | "other";

const GROUP_CONFIG: Record<FileGroup, { label: string; color: string }> = {
  design: { label: "Design / Images", color: "#4a90d9" },
  hueforge: { label: "HueForge", color: "#e67e22" },
  hueforge_export: { label: "HueForge Export", color: "#d4841a" },
  print: { label: "3MF / Print", color: "#2ecc71" },
  other: { label: "Other", color: "#6b7280" },
};

const GROUP_ORDER: FileGroup[] = ["design", "hueforge", "hueforge_export", "print", "other"];

function getExt(filename: string): string {
  const parts = filename.split(".");
  return parts.length > 1 ? parts[parts.length - 1].toLowerCase() : "";
}

function getGroup(filename: string): FileGroup {
  const ext = getExt(filename);
  if (PRINT_EXTS.has(ext)) return "print";
  if (HUEFORGE_EXTS.has(ext)) return "hueforge";
  if (HUEFORGE_EXPORT_EXTS.has(ext)) return "hueforge_export";
  if (IMAGE_EXTS.has(ext)) return "design";
  return "other";
}

function getAppForFile(ext: string): { name: string; app: string; btnClass: string } | null {
  if (PRINT_EXTS.has(ext)) return {
    name: "Bambu Studio",
    app: "BambuStudio",
    btnClass: "bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-400 border border-green-200 dark:border-green-800 hover:bg-green-100 dark:hover:bg-green-900/40",
  };
  if (ext === "af" || ext === "afdesign" || ext === "afphoto" || ext === "afpub") return {
    name: "Affinity",
    app: "Affinity Designer 2",
    btnClass: "bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-400 border border-blue-200 dark:border-blue-800 hover:bg-blue-100 dark:hover:bg-blue-900/40",
  };
  if (ext === "hfp") return {
    name: "HueForge",
    app: "HueForge",
    btnClass: "bg-orange-50 dark:bg-orange-900/20 text-orange-700 dark:text-orange-400 border border-orange-200 dark:border-orange-800 hover:bg-orange-100 dark:hover:bg-orange-900/40",
  };
  return null;
}

// ── Preview Panel ──

function PreviewPanel({ file, onClose }: { file: ProjectFile; onClose: () => void }) {
  const ext = getExt(file.original_filename);
  const isImage = PREVIEW_IMAGE_EXTS.has(ext);
  const isText = PREVIEW_TEXT_EXTS.has(ext);
  const [textContent, setTextContent] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const copyTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (isText && textContent === null) {
      readTextFile(file.file_path).then(setTextContent).catch(() => setTextContent("(Failed to load file)"));
    }
  }, [file.file_path, isText, textContent]);

  useEffect(() => {
    return () => {
      if (copyTimerRef.current) clearTimeout(copyTimerRef.current);
    };
  }, []);

  async function handleCopy() {
    if (textContent) {
      await navigator.clipboard.writeText(textContent);
      setCopied(true);
      if (copyTimerRef.current) clearTimeout(copyTimerRef.current);
      copyTimerRef.current = setTimeout(() => setCopied(false), 1500);
    }
  }

  return (
    <div className="border-l border-gray-200 dark:border-gray-700 flex flex-col bg-gray-50 dark:bg-gray-800/50 w-1/2 shrink-0">
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200 dark:border-gray-700">
        <span className="text-sm font-medium text-gray-900 dark:text-gray-100 truncate">
          {file.original_filename}
        </span>
        <button
          onClick={onClose}
          className="p-1 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 cursor-pointer"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>
      <div className="flex-1 overflow-auto p-4">
        {isImage && (
          <img
            src={convertFileSrc(file.file_path)}
            alt={file.original_filename}
            className="max-w-full object-contain mx-auto rounded-lg"
            style={{ maxHeight: "70vh" }}
          />
        )}
        {isText && (
          <div className="relative">
            <button
              onClick={handleCopy}
              className="absolute top-2 right-2 text-xs px-2 py-1 rounded bg-gray-200 dark:bg-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-300 dark:hover:bg-gray-600 cursor-pointer"
            >
              {copied ? "Copied!" : "Copy"}
            </button>
            <pre className="text-xs text-gray-700 dark:text-gray-300 whitespace-pre-wrap font-mono bg-white dark:bg-gray-900 rounded-lg p-4 border border-gray-200 dark:border-gray-700 select-text">
              {textContent ?? "Loading..."}
            </pre>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Main Component ──

interface FileListProps {
  files: ProjectFile[];
  projectId: string;
  onRefresh: () => void;
  onSetThumbnail?: (filePath: string) => void;
  openPreviewFileId?: string | null;
  onPreviewChange?: (fileId: string | null) => void;
}

export default function FileList({ files, projectId, onRefresh, onSetThumbnail, openPreviewFileId, onPreviewChange }: FileListProps) {
  const [previewFile, setPreviewFileState] = useState<ProjectFile | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(new Set());
  const [contextMenu, setContextMenu] = useState<{ file: ProjectFile; top: number; left: number } | null>(null);
  const [editingNoteId, setEditingNoteId] = useState<string | null>(null);
  const [notesInput, setNotesInput] = useState("");
  const [viewMode, setViewMode] = useState<"list" | "grid">("list");
  const scrollRef = useRef<HTMLDivElement>(null);
  const contextMenuRef = useRef<HTMLDivElement>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<{ id: string; name: string } | null>(null);

  // External preview control
  useEffect(() => {
    if (openPreviewFileId) {
      const file = files.find(f => f.id === openPreviewFileId);
      if (file) setPreviewFileState(file);
    }
  }, [openPreviewFileId, files]);

  function setPreviewFile(file: ProjectFile | null) {
    setPreviewFileState(file);
    onPreviewChange?.(file?.id ?? null);
  }

  // Close context menu on outside click, scroll, or Escape
  useEffect(() => {
    if (!contextMenu) return;
    const scrollEl = scrollRef.current;
    function handleClick(e: MouseEvent) {
      if (contextMenuRef.current?.contains(e.target as Node)) return;
      setContextMenu(null);
    }
    function handleScroll() { setContextMenu(null); }
    function handleKey(e: KeyboardEvent) {
      if (e.key === "Escape") setContextMenu(null);
    }
    document.addEventListener("mousedown", handleClick);
    document.addEventListener("keydown", handleKey);
    scrollEl?.addEventListener("scroll", handleScroll);
    return () => {
      document.removeEventListener("mousedown", handleClick);
      document.removeEventListener("keydown", handleKey);
      scrollEl?.removeEventListener("scroll", handleScroll);
    };
  }, [contextMenu]);

  // Filter files by search query
  const filteredFiles = useMemo(() =>
    searchQuery
      ? files.filter(f => f.original_filename.toLowerCase().includes(searchQuery.toLowerCase()))
      : files,
    [files, searchQuery]
  );

  // Favorites from unfiltered list (for chips strip)
  const allFavorites = useMemo(() => files.filter(f => f.favorited), [files]);

  // Group ALL filtered files into categories (favorites included in their natural group)
  const groups = useMemo(() => {
    const g: Record<FileGroup, ProjectFile[]> = { design: [], hueforge: [], hueforge_export: [], print: [], other: [] };
    for (const f of filteredFiles) {
      g[getGroup(f.original_filename)].push(f);
    }
    return g;
  }, [filteredFiles]);

  // ── Handlers ──

  async function handleImport() {
    const selected = await open({ multiple: true });
    if (!selected) return;
    const paths: string[] = [];
    if (Array.isArray(selected)) {
      for (const item of selected) {
        const p = typeof item === "string" ? item : (item as { path: string }).path;
        if (p) paths.push(p);
      }
    } else {
      const p = typeof selected === "string" ? selected : (selected as { path: string }).path;
      if (p) paths.push(p);
    }
    if (paths.length === 0) return;
    await importFiles(projectId, paths);
    onRefresh();
  }

  async function handleDelete(fileId: string) {
    if (previewFile?.id === fileId) setPreviewFile(null);
    await deleteFile(fileId);
    onRefresh();
    setContextMenu(null);
  }

  function confirmDelete(file: ProjectFile) {
    setDeleteConfirm({ id: file.id, name: file.original_filename });
    setContextMenu(null);
  }

  async function handleEditNotes(fileId: string, notes: string) {
    await updateFileNotes(fileId, notes);
    onRefresh();
  }

  async function handleToggleFavorite(fileId: string) {
    await toggleFileFavorite(fileId);
    onRefresh();
  }

  async function handleSync() {
    setSyncing(true);
    await syncProjectFiles(projectId);
    await onRefresh();
    setSyncing(false);
  }

  function handleFileSelect(file: ProjectFile) {
    setPreviewFile(previewFile?.id === file.id ? null : file);
  }

  function toggleGroup(group: string) {
    setCollapsedGroups(prev => {
      const next = new Set(prev);
      if (next.has(group)) next.delete(group);
      else next.add(group);
      return next;
    });
  }

  function openContextMenu(file: ProjectFile, e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    setContextMenu({
      file,
      top: rect.bottom + 4,
      left: Math.min(rect.right - 180, window.innerWidth - 200),
    });
  }

  function startEditNotes(file: ProjectFile) {
    setEditingNoteId(file.id);
    setNotesInput(file.notes);
    setContextMenu(null);
  }

  // ── Render ──

  return (
    <div className="flex rounded-lg border border-gray-200 dark:border-gray-700 overflow-hidden" style={{ minHeight: "300px" }}>
      {/* File list side */}
      <div className={`flex flex-col ${previewFile ? "w-1/2" : "w-full"} transition-all`}>
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-2.5 bg-gray-50 dark:bg-gray-800/50 border-b border-gray-200 dark:border-gray-700">
          <div className="flex items-center gap-2">
            <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100">Files</h3>
            <span className="text-xs text-gray-500 dark:text-gray-400">{files.length}</span>
          </div>
          <div className="flex items-center gap-2">
            {/* List / Grid toggle */}
            <div className="flex items-center rounded-md border border-gray-300 dark:border-gray-600 overflow-hidden">
              <button
                onClick={() => setViewMode("list")}
                className={`p-1.5 cursor-pointer transition-colors ${
                  viewMode === "list"
                    ? "bg-gray-200 dark:bg-gray-600 text-gray-800 dark:text-gray-100"
                    : "text-gray-400 dark:text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-700"
                }`}
                title="List view"
              >
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
                </svg>
              </button>
              <button
                onClick={() => setViewMode("grid")}
                className={`p-1.5 cursor-pointer transition-colors ${
                  viewMode === "grid"
                    ? "bg-gray-200 dark:bg-gray-600 text-gray-800 dark:text-gray-100"
                    : "text-gray-400 dark:text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-700"
                }`}
                title="Grid view"
              >
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 5a1 1 0 011-1h4a1 1 0 011 1v4a1 1 0 01-1 1H5a1 1 0 01-1-1V5zm10 0a1 1 0 011-1h4a1 1 0 011 1v4a1 1 0 01-1 1h-4a1 1 0 01-1-1V5zM4 15a1 1 0 011-1h4a1 1 0 011 1v4a1 1 0 01-1 1H5a1 1 0 01-1-1v-4zm10 0a1 1 0 011-1h4a1 1 0 011 1v4a1 1 0 01-1 1h-4a1 1 0 01-1-1v-4z" />
                </svg>
              </button>
            </div>
            <button
              onClick={handleSync}
              disabled={syncing}
              className="text-xs px-2 py-1.5 rounded-lg border border-gray-300 dark:border-gray-600 text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 cursor-pointer disabled:opacity-50 transition-colors"
              title="Scan folder for new/removed files"
            >
              <svg className={`w-3.5 h-3.5 inline-block mr-1 ${syncing ? "animate-spin" : ""}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
              Refresh
            </button>
            <button
              onClick={handleImport}
              className="text-xs px-2 py-1.5 rounded-lg bg-indigo-500 text-white font-medium hover:bg-indigo-600 cursor-pointer transition-colors"
            >
              + Import
            </button>
          </div>
        </div>

        {/* Search bar */}
        {files.length > 0 && (
          <div className="px-3 py-2 border-b border-gray-200 dark:border-gray-700">
            <div className="relative">
              <svg className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search files..."
                className="w-full pl-8 pr-8 py-1.5 text-xs rounded-md bg-gray-100 dark:bg-gray-800 border border-transparent focus:border-indigo-400 focus:bg-white dark:focus:bg-gray-900 text-gray-900 dark:text-gray-100 placeholder-gray-400 outline-none transition-colors"
              />
              {searchQuery && (
                <button
                  onClick={() => setSearchQuery("")}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 cursor-pointer"
                >
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              )}
            </div>
          </div>
        )}

        {/* Favorites chips strip */}
        {allFavorites.length > 0 && !searchQuery && (
          <div className="px-3 py-2 border-b border-gray-100 dark:border-gray-800" style={{ backgroundColor: "rgba(251, 191, 36, 0.04)" }}>
            <div className="flex items-center gap-1.5 overflow-x-auto" style={{ scrollbarWidth: "none" }}>
              <svg className="w-3 h-3 text-amber-400 shrink-0" fill="currentColor" viewBox="0 0 24 24">
                <path d="M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z" />
              </svg>
              {allFavorites.map(f => {
                const ext = getExt(f.original_filename);
                return (
                  <button
                    key={f.id}
                    onClick={() => handleFileSelect(f)}
                    className={`flex items-center gap-1.5 px-2 py-1 rounded-md text-[11px] shrink-0 cursor-pointer transition-colors border ${
                      previewFile?.id === f.id
                        ? "bg-amber-100 dark:bg-amber-900/30 text-amber-800 dark:text-amber-300 border-amber-300 dark:border-amber-700"
                        : "bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:bg-amber-50 dark:hover:bg-amber-900/20 border-gray-200 dark:border-gray-700"
                    }`}
                    title={f.original_filename}
                  >
                    {f.thumbnail_path ? (
                      <img src={convertFileSrc(f.thumbnail_path)} alt="" className="w-4 h-4 rounded object-cover shrink-0" />
                    ) : (
                      <span className="text-[8px] font-bold uppercase text-gray-400 w-4 text-center shrink-0">{ext}</span>
                    )}
                    <span className="truncate max-w-[100px]">{f.original_filename}</span>
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* File groups (scrollable) */}
        <div className="flex-1 overflow-y-auto" ref={scrollRef}>
          {files.length === 0 ? (
            <div className="px-4 py-8 text-center text-sm text-gray-400 dark:text-gray-500">
              No files yet. Import or drop files into the project folder and hit Refresh.
            </div>
          ) : filteredFiles.length === 0 ? (
            <div className="px-4 py-6 text-center text-sm text-gray-400 dark:text-gray-500">
              No files matching &ldquo;{searchQuery}&rdquo;
            </div>
          ) : (
            GROUP_ORDER.map((group) => {
              const groupFiles = groups[group];
              if (groupFiles.length === 0) return null;
              const cfg = GROUP_CONFIG[group];
              const isCollapsed = collapsedGroups.has(group);

              return (
                <div key={group}>
                  {/* Group header - clickable to collapse/expand */}
                  <button
                    onClick={() => toggleGroup(group)}
                    className="w-full flex items-center gap-2 px-3 py-1.5 cursor-pointer hover:brightness-95 dark:hover:brightness-110 transition-all"
                    style={{ backgroundColor: cfg.color + "10" }}
                  >
                    <svg
                      className={`w-3 h-3 text-gray-400 transition-transform shrink-0 ${isCollapsed ? "" : "rotate-90"}`}
                      fill="none" stroke="currentColor" viewBox="0 0 24 24"
                    >
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                    </svg>
                    <div className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: cfg.color }} />
                    <span className="text-xs font-semibold uppercase tracking-wider shrink-0" style={{ color: cfg.color }}>
                      {cfg.label}
                    </span>
                    <span className="text-[10px] text-gray-400 shrink-0">{groupFiles.length}</span>
                    {isCollapsed && (
                      <span className="text-[10px] text-gray-400 dark:text-gray-500 truncate ml-1">
                        {groupFiles.map(f => f.original_filename).join(", ")}
                      </span>
                    )}
                  </button>

                  {/* File rows / grid */}
                  {!isCollapsed && viewMode === "grid" ? (
                    <div className="flex flex-wrap gap-2 px-3 py-2">
                      {groupFiles.map((file) => {
                        const ext = getExt(file.original_filename);
                        const canPreview = PREVIEW_IMAGE_EXTS.has(ext) || PREVIEW_TEXT_EXTS.has(ext);
                        const hasVisual = file.thumbnail_path || PREVIEW_IMAGE_EXTS.has(ext);
                        const appInfo = getAppForFile(ext);

                        return (
                          <div
                            key={file.id}
                            className={`relative group rounded-lg border overflow-hidden cursor-pointer transition-colors ${
                              previewFile?.id === file.id
                                ? "border-indigo-400 dark:border-indigo-500 ring-1 ring-indigo-400/30"
                                : "border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600"
                            }`}
                            style={{ width: previewFile ? "calc(50% - 4px)" : "120px" }}
                            onClick={() => canPreview ? handleFileSelect(file) : revealInFinder(file.file_path)}
                            onContextMenu={(e) => openContextMenu(file, e)}
                          >
                            {/* Thumbnail area */}
                            <div className="aspect-square bg-gray-100 dark:bg-gray-800 flex items-center justify-center overflow-hidden">
                              {hasVisual ? (
                                <img
                                  src={convertFileSrc(file.thumbnail_path || file.file_path)}
                                  alt=""
                                  className="w-full h-full object-cover"
                                  loading="lazy"
                                />
                              ) : (
                                <span className="text-sm font-bold uppercase text-gray-400 dark:text-gray-500">{ext || "?"}</span>
                              )}
                            </div>

                            {/* Star overlay */}
                            <button
                              onClick={(e) => { e.stopPropagation(); handleToggleFavorite(file.id); }}
                              className={`absolute top-1 right-1 p-0.5 rounded cursor-pointer transition-all ${
                                file.favorited
                                  ? "text-amber-400 hover:text-amber-500"
                                  : "text-white/60 opacity-0 group-hover:opacity-100 hover:text-amber-400 drop-shadow-md"
                              }`}
                            >
                              <svg className="w-3.5 h-3.5" fill={file.favorited ? "currentColor" : "none"} stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z" />
                              </svg>
                            </button>

                            {/* Context menu trigger overlay */}
                            <button
                              onClick={(e) => openContextMenu(file, e)}
                              className="absolute top-1 left-1 p-0.5 rounded text-white/60 opacity-0 group-hover:opacity-100 hover:text-white cursor-pointer transition-all drop-shadow-md"
                            >
                              <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 24 24">
                                <circle cx="12" cy="5" r="1.5" />
                                <circle cx="12" cy="12" r="1.5" />
                                <circle cx="12" cy="19" r="1.5" />
                              </svg>
                            </button>

                            {/* App badge overlay */}
                            {appInfo && (
                              <button
                                onClick={(e) => { e.stopPropagation(); openFileWithApp(file.file_path, appInfo.app); }}
                                className={`absolute bottom-7 right-1 text-[8px] font-medium px-1 py-0.5 rounded opacity-0 group-hover:opacity-100 cursor-pointer transition-all ${appInfo.btnClass}`}
                                title={`Open in ${appInfo.name}`}
                              >
                                {appInfo.name}
                              </button>
                            )}

                            {/* Filename */}
                            <div className="px-1.5 py-1 bg-white dark:bg-gray-900">
                              <p className="text-[10px] text-gray-700 dark:text-gray-300 truncate" title={file.original_filename}>
                                {file.original_filename}
                              </p>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  ) : !isCollapsed && groupFiles.map((file) => {
                    const ext = getExt(file.original_filename);
                    const canPreview = PREVIEW_IMAGE_EXTS.has(ext) || PREVIEW_TEXT_EXTS.has(ext);
                    const appInfo = getAppForFile(ext);
                    const isEditing = editingNoteId === file.id;

                    return (
                      <div
                        key={file.id}
                        className={`flex items-center gap-2 px-3 py-1.5 group cursor-pointer transition-colors ${
                          previewFile?.id === file.id
                            ? "bg-indigo-50 dark:bg-indigo-900/20"
                            : "hover:bg-gray-50 dark:hover:bg-gray-800/50"
                        }`}
                        onClick={() => canPreview ? handleFileSelect(file) : revealInFinder(file.file_path)}
                        onContextMenu={(e) => openContextMenu(file, e)}
                      >
                        {/* Thumbnail / ext badge */}
                        <div className="w-6 h-6 rounded flex items-center justify-center shrink-0 overflow-hidden bg-gray-100 dark:bg-gray-700">
                          {file.thumbnail_path ? (
                            <img src={convertFileSrc(file.thumbnail_path)} alt="" className="w-full h-full object-cover" />
                          ) : (
                            <span className="text-[8px] font-bold uppercase text-gray-500 dark:text-gray-400">{ext || "?"}</span>
                          )}
                        </div>

                        {/* Favorite star */}
                        <button
                          onClick={(e) => { e.stopPropagation(); handleToggleFavorite(file.id); }}
                          className={`shrink-0 cursor-pointer transition-colors ${
                            file.favorited
                              ? "text-amber-400 hover:text-amber-500"
                              : "text-gray-300 dark:text-gray-600 opacity-0 group-hover:opacity-100 hover:text-amber-400"
                          }`}
                          title={file.favorited ? "Remove from favorites" : "Add to favorites"}
                        >
                          <svg className="w-3 h-3" fill={file.favorited ? "currentColor" : "none"} stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z" />
                          </svg>
                        </button>

                        {/* File info */}
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="text-sm text-gray-900 dark:text-gray-100 truncate">{file.original_filename}</span>
                            {file.notes && !isEditing && (
                              <span className="shrink-0" title={file.notes}>
                                <svg
                                  className="w-3 h-3 text-indigo-400"
                                  fill="none" stroke="currentColor" viewBox="0 0 24 24"
                                >
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 8h10M7 12h4m1 8l-4-4H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-3l-4 4z" />
                                </svg>
                              </span>
                            )}
                            {file.file_size > 0 && (
                              <span className="text-[10px] text-gray-400 dark:text-gray-500 shrink-0">{formatFileSize(file.file_size)}</span>
                            )}
                            {file.modified_at && (
                              <span className="text-[10px] text-gray-400 dark:text-gray-500 shrink-0">{formatDate(file.modified_at)}</span>
                            )}
                          </div>
                          {isEditing && (
                            <input
                              autoFocus
                              value={notesInput}
                              onChange={(e) => setNotesInput(e.target.value)}
                              onBlur={() => { handleEditNotes(file.id, notesInput); setEditingNoteId(null); }}
                              onKeyDown={(e) => {
                                if (e.key === "Enter") { handleEditNotes(file.id, notesInput); setEditingNoteId(null); }
                                if (e.key === "Escape") setEditingNoteId(null);
                              }}
                              onClick={(e) => e.stopPropagation()}
                              className="w-full text-xs bg-transparent border-b border-indigo-400 focus:outline-none text-gray-600 dark:text-gray-300 mt-0.5"
                              placeholder="Add a note..."
                            />
                          )}
                        </div>

                        {/* Open in app button (compact) */}
                        {appInfo && (
                          <button
                            onClick={(e) => { e.stopPropagation(); openFileWithApp(file.file_path, appInfo.app); }}
                            className={`shrink-0 flex items-center gap-1 text-[10px] font-medium px-1.5 py-0.5 rounded cursor-pointer transition-colors ${appInfo.btnClass}`}
                            title={`Open in ${appInfo.name}`}
                          >
                            <svg className="w-2.5 h-2.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                            </svg>
                            {appInfo.name}
                          </button>
                        )}

                        {/* Context menu trigger */}
                        <button
                          onClick={(e) => openContextMenu(file, e)}
                          className="shrink-0 p-1 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 rounded hover:bg-gray-100 dark:hover:bg-gray-700 opacity-0 group-hover:opacity-100 cursor-pointer transition-all"
                          title="More actions"
                        >
                          <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 24 24">
                            <circle cx="12" cy="5" r="1.5" />
                            <circle cx="12" cy="12" r="1.5" />
                            <circle cx="12" cy="19" r="1.5" />
                          </svg>
                        </button>
                      </div>
                    );
                  })}
                </div>
              );
            })
          )}
        </div>
      </div>

      {/* Preview panel */}
      {previewFile && (
        <PreviewPanel file={previewFile} onClose={() => setPreviewFile(null)} />
      )}

      {/* Context menu (fixed-position overlay) */}
      {contextMenu && (
        <div
          ref={contextMenuRef}
          className="fixed z-50 bg-white dark:bg-gray-800 rounded-lg shadow-xl border border-gray-200 dark:border-gray-700 py-1 min-w-[160px]"
          style={{ top: contextMenu.top, left: contextMenu.left }}
        >
          {getAppForFile(getExt(contextMenu.file.original_filename)) && (() => {
            const app = getAppForFile(getExt(contextMenu.file.original_filename))!;
            return (
              <button
                onClick={() => { openFileWithApp(contextMenu.file.file_path, app.app); setContextMenu(null); }}
                className="w-full text-left px-3 py-1.5 text-xs text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 flex items-center gap-2 cursor-pointer"
              >
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                </svg>
                Open in {app.name}
              </button>
            );
          })()}
          <button
            onClick={() => { revealInFinder(contextMenu.file.file_path); setContextMenu(null); }}
            className="w-full text-left px-3 py-1.5 text-xs text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 flex items-center gap-2 cursor-pointer"
          >
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 19a2 2 0 01-2-2V7a2 2 0 012-2h4l2 2h4a2 2 0 012 2v1M5 19h14a2 2 0 002-2v-5a2 2 0 00-2-2H9a2 2 0 00-2 2v5a2 2 0 01-2 2z" />
            </svg>
            Show in Folder
          </button>
          <button
            onClick={() => startEditNotes(contextMenu.file)}
            className="w-full text-left px-3 py-1.5 text-xs text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 flex items-center gap-2 cursor-pointer"
          >
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
            </svg>
            {contextMenu.file.notes ? "Edit notes" : "Add notes"}
          </button>
          {onSetThumbnail && PREVIEW_IMAGE_EXTS.has(getExt(contextMenu.file.original_filename)) && (
            <button
              onClick={() => { onSetThumbnail(contextMenu.file.file_path); setContextMenu(null); }}
              className="w-full text-left px-3 py-1.5 text-xs text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 flex items-center gap-2 cursor-pointer"
            >
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
              </svg>
              Set as thumbnail
            </button>
          )}
          <div className="border-t border-gray-200 dark:border-gray-700 my-1" />
          <button
            onClick={() => confirmDelete(contextMenu.file)}
            className="w-full text-left px-3 py-1.5 text-xs text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 flex items-center gap-2 cursor-pointer"
          >
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
            </svg>
            Delete
          </button>
        </div>
      )}

      <ConfirmDialog
        open={deleteConfirm !== null}
        title="Delete file"
        message={`Are you sure you want to delete "${deleteConfirm?.name}"? This cannot be undone.`}
        confirmLabel="Delete"
        danger
        onConfirm={() => {
          if (deleteConfirm) handleDelete(deleteConfirm.id);
          setDeleteConfirm(null);
        }}
        onCancel={() => setDeleteConfirm(null)}
      />
    </div>
  );
}
