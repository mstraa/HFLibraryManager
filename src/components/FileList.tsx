import { useEffect, useState } from "react";
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
} from "../lib/api";
import type { ProjectFile } from "../lib/types";

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

function formatFileSize(bytes: number): string {
  if (bytes === 0) return "";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

// ── Preview Panel ──

function PreviewPanel({ file, onClose }: { file: ProjectFile; onClose: () => void }) {
  const ext = getExt(file.original_filename);
  const isImage = PREVIEW_IMAGE_EXTS.has(ext);
  const isText = PREVIEW_TEXT_EXTS.has(ext);
  const [textContent, setTextContent] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  if (isText && textContent === null) {
    readTextFile(file.file_path).then(setTextContent);
  }

  async function handleCopy() {
    if (textContent) {
      await navigator.clipboard.writeText(textContent);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    }
  }

  return (
    <div className="border-l border-gray-200 dark:border-gray-700 flex flex-col bg-gray-50 dark:bg-gray-800/50 w-1/2 shrink-0">
      {/* Header */}
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

      {/* Content */}
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

// ── File Row ──

function FileRow({
  file,
  isSelected,
  onSelect,
  onDelete,
  onEditNotes,
  onToggleFavorite,
  onSetThumbnail,
}: {
  file: ProjectFile;
  isSelected: boolean;
  onSelect: () => void;
  onDelete: () => void;
  onEditNotes: (id: string, notes: string) => void;
  onToggleFavorite: () => void;
  onSetThumbnail?: () => void;
}) {
  const ext = getExt(file.original_filename);
  const canPreview = PREVIEW_IMAGE_EXTS.has(ext) || PREVIEW_TEXT_EXTS.has(ext);
  const [editing, setEditing] = useState(false);
  const [notesInput, setNotesInput] = useState(file.notes);

  function handleClick() {
    if (canPreview) {
      onSelect();
    } else {
      revealInFinder(file.file_path);
    }
  }

  async function saveNotes() {
    onEditNotes(file.id, notesInput);
    setEditing(false);
  }

  return (
    <div
      className={`flex items-center gap-3 px-4 py-2.5 group cursor-pointer transition-colors ${
        isSelected
          ? "bg-indigo-50 dark:bg-indigo-900/20"
          : "hover:bg-gray-50 dark:hover:bg-gray-800/50"
      }`}
      onClick={handleClick}
    >
      {/* Thumbnail or ext badge */}
      <div className="w-8 h-8 rounded flex items-center justify-center shrink-0 overflow-hidden bg-gray-100 dark:bg-gray-700">
        {file.thumbnail_path ? (
          <img
            src={convertFileSrc(file.thumbnail_path)}
            alt=""
            className="w-full h-full object-cover"
          />
        ) : (
          <span className="text-[9px] font-bold uppercase text-gray-500 dark:text-gray-400">
            {ext || "?"}
          </span>
        )}
      </div>

      {/* Info */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="text-sm text-gray-900 dark:text-gray-100 truncate">
            {file.original_filename}
          </span>
          {file.file_size > 0 && (
            <span className="text-[10px] text-gray-400 dark:text-gray-500 shrink-0">
              {formatFileSize(file.file_size)}
            </span>
          )}
        </div>
        {editing ? (
          <input
            autoFocus
            value={notesInput}
            onChange={(e) => setNotesInput(e.target.value)}
            onBlur={saveNotes}
            onKeyDown={(e) => {
              if (e.key === "Enter") saveNotes();
              if (e.key === "Escape") setEditing(false);
            }}
            onClick={(e) => e.stopPropagation()}
            className="w-full text-xs bg-transparent border-b border-indigo-400 focus:outline-none text-gray-600 dark:text-gray-300 mt-0.5"
            placeholder="Add a note..."
          />
        ) : file.notes ? (
          <div
            className="text-xs text-gray-400 dark:text-gray-500 truncate mt-0.5 hover:text-indigo-500"
            onClick={(e) => { e.stopPropagation(); setEditing(true); }}
          >
            {file.notes}
          </div>
        ) : null}
      </div>

      {/* Actions */}
      <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity" onClick={(e) => e.stopPropagation()}>
        {!canPreview && (
          <span className="text-[9px] text-gray-400 dark:text-gray-500 mr-1">Finder</span>
        )}
        {onSetThumbnail && (
          <button
            onClick={onSetThumbnail}
            className="p-1 text-gray-400 hover:text-indigo-500 rounded hover:bg-gray-100 dark:hover:bg-gray-700 cursor-pointer"
            title="Set as project thumbnail"
          >
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
            </svg>
          </button>
        )}
        <button
          onClick={() => { setEditing(true); setNotesInput(file.notes); }}
          className="p-1 text-gray-400 hover:text-indigo-500 rounded hover:bg-gray-100 dark:hover:bg-gray-700 cursor-pointer"
          title="Edit note"
        >
          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
          </svg>
        </button>
        <button
          onClick={onDelete}
          className="p-1 text-gray-400 hover:text-red-500 rounded hover:bg-gray-100 dark:hover:bg-gray-700 cursor-pointer"
          title="Delete file"
        >
          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
          </svg>
        </button>
      </div>

      {/* Favorite star */}
      <button
        onClick={(e) => { e.stopPropagation(); onToggleFavorite(); }}
        className={`p-1 rounded cursor-pointer transition-colors shrink-0 ${
          file.favorited
            ? "text-amber-400 hover:text-amber-500"
            : "text-gray-300 dark:text-gray-600 opacity-0 group-hover:opacity-100 hover:text-amber-400"
        }`}
        title={file.favorited ? "Remove from selected" : "Add to selected"}
      >
        <svg className="w-3.5 h-3.5" fill={file.favorited ? "currentColor" : "none"} stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z" />
        </svg>
      </button>
    </div>
  );
}

// ── Main Component ──

const THUMBNAIL_EXTS = new Set(["png", "jpg", "jpeg", "webp", "gif", "bmp", "svg"]);

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

  // Allow external control of preview
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
  const [syncing, setSyncing] = useState(false);

  // Separate favorites and group remaining files
  const favorites = files.filter(f => f.favorited);
  const nonFavorites = files.filter(f => !f.favorited);
  const groups: Record<FileGroup, ProjectFile[]> = { design: [], hueforge: [], hueforge_export: [], print: [], other: [] };
  for (const f of nonFavorites) {
    groups[getGroup(f.original_filename)].push(f);
  }

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

  return (
    <div className="flex rounded-lg border border-gray-200 dark:border-gray-700 overflow-hidden" style={{ minHeight: "300px" }}>
      {/* File list side */}
      <div className={`flex flex-col ${previewFile ? "w-1/2" : "w-full"} transition-all`}>
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 bg-gray-50 dark:bg-gray-800/50 border-b border-gray-200 dark:border-gray-700">
          <div className="flex items-center gap-2">
            <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100">
              Files
            </h3>
            <span className="text-xs text-gray-500 dark:text-gray-400">
              {files.length}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={handleSync}
              disabled={syncing}
              className="text-xs px-2.5 py-1.5 rounded-lg border border-gray-300 dark:border-gray-600 text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 cursor-pointer disabled:opacity-50 transition-colors"
              title="Scan folder for new/removed files"
            >
              <svg className={`w-3.5 h-3.5 inline-block mr-1 ${syncing ? "animate-spin" : ""}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
              Refresh
            </button>
            <button
              onClick={handleImport}
              className="text-xs px-2.5 py-1.5 rounded-lg bg-indigo-500 text-white font-medium hover:bg-indigo-600 cursor-pointer transition-colors"
            >
              + Import
            </button>
          </div>
        </div>

        {/* Grouped files */}
        <div className="flex-1 overflow-y-auto">
          {files.length === 0 ? (
            <div className="px-4 py-8 text-center text-sm text-gray-400 dark:text-gray-500">
              No files yet. Import or drop files into the project folder and hit Refresh.
            </div>
          ) : (
            <>
            {favorites.length > 0 && (
              <div>
                <div
                  className="flex items-center gap-2 px-4 py-2 sticky top-0 z-10"
                  style={{ backgroundColor: "rgba(251, 191, 36, 0.06)" }}
                >
                  <svg className="w-3 h-3 text-amber-400" fill="currentColor" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z" />
                  </svg>
                  <span className="text-xs font-semibold uppercase tracking-wider text-amber-500">
                    Selected
                  </span>
                  <span className="text-[10px] text-gray-400">{favorites.length}</span>
                </div>
                <div className="divide-y divide-gray-100 dark:divide-gray-800">
                  {favorites.map((file) => (
                    <FileRow
                      key={file.id}
                      file={file}
                      isSelected={previewFile?.id === file.id}
                      onSelect={() => handleFileSelect(file)}
                      onDelete={() => handleDelete(file.id)}
                      onEditNotes={handleEditNotes}
                      onToggleFavorite={() => handleToggleFavorite(file.id)}
                      onSetThumbnail={onSetThumbnail && THUMBNAIL_EXTS.has(getExt(file.original_filename)) ? () => onSetThumbnail(file.file_path) : undefined}
                    />
                  ))}
                </div>
              </div>
            )}
            {GROUP_ORDER.map((group) => {
              const groupFiles = groups[group];
              if (groupFiles.length === 0) return null;
              const cfg = GROUP_CONFIG[group];
              return (
                <div key={group}>
                  {/* Group header */}
                  <div
                    className="flex items-center gap-2 px-4 py-2 sticky top-0 z-10"
                    style={{ backgroundColor: cfg.color + "10" }}
                  >
                    <div className="w-2 h-2 rounded-full" style={{ backgroundColor: cfg.color }} />
                    <span className="text-xs font-semibold uppercase tracking-wider" style={{ color: cfg.color }}>
                      {cfg.label}
                    </span>
                    <span className="text-[10px] text-gray-400">{groupFiles.length}</span>
                  </div>
                  {/* Files */}
                  <div className="divide-y divide-gray-100 dark:divide-gray-800">
                    {groupFiles.map((file) => (
                      <FileRow
                        key={file.id}
                        file={file}
                        isSelected={previewFile?.id === file.id}
                        onSelect={() => handleFileSelect(file)}
                        onDelete={() => handleDelete(file.id)}
                        onEditNotes={handleEditNotes}
                        onToggleFavorite={() => handleToggleFavorite(file.id)}
                        onSetThumbnail={onSetThumbnail && THUMBNAIL_EXTS.has(getExt(file.original_filename)) ? () => onSetThumbnail(file.file_path) : undefined}
                      />
                    ))}
                  </div>
                </div>
              );
            })}
            </>
          )}
        </div>
      </div>

      {/* Preview panel */}
      {previewFile && (
        <PreviewPanel
          file={previewFile}
          onClose={() => setPreviewFile(null)}
        />
      )}
    </div>
  );
}
