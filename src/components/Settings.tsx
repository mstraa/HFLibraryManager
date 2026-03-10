import { useCallback, useEffect, useState } from "react";
import { open } from "@tauri-apps/plugin-dialog";
import { getLibraries, addLibrary, removeLibrary, switchLibrary, renameLibrary, getStorageSizes, emptyTrash, clearAllCuratedFilaments, reparseAllProjectFilaments, rematchUnmatchedFilaments } from "../lib/api";
import { onDragMouseDown } from "../hooks/useDrag";
import { useTheme, type Theme } from "../hooks/useTheme";
import { useThumbnailMode } from "../hooks/useThumbnailMode";
import type { ThumbnailMode } from "../lib/types";

interface SettingsProps {
  onBack: () => void;
  onLibraryChanged: () => void;
}

interface LibraryEntry {
  name: string;
  path: string;
}

function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 B";
  const units = ["B", "KB", "MB", "GB", "TB"];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  const value = bytes / Math.pow(1024, i);
  return `${value < 10 ? value.toFixed(1) : Math.round(value)} ${units[i]}`;
}

export default function Settings({ onBack, onLibraryChanged }: SettingsProps) {
  const [libraries, setLibraries] = useState<LibraryEntry[]>([]);
  const [activeIndex, setActiveIndex] = useState(0);
  const [editingName, setEditingName] = useState<number | null>(null);
  const [editNameValue, setEditNameValue] = useState("");
  const [showRemoveConfirm, setShowRemoveConfirm] = useState<number | null>(null);
  const [projectsSize, setProjectsSize] = useState<number | null>(null);
  const [deletedSize, setDeletedSize] = useState<number | null>(null);
  const [showEmptyTrashConfirm, setShowEmptyTrashConfirm] = useState(false);
  const [emptyingTrash, setEmptyingTrash] = useState(false);
  const [showClearFilamentsConfirm, setShowClearFilamentsConfirm] = useState(false);
  const [clearingFilaments, setClearingFilaments] = useState(false);
  const [reparsingFilaments, setReparsingFilaments] = useState(false);
  const [reparseResult, setReparseResult] = useState<number | null>(null);
  const [rematchingFilaments, setRematchingFilaments] = useState(false);
  const [rematchResult, setRematchResult] = useState<number | null>(null);
  const { theme, setTheme } = useTheme();
  const [thumbnailMode, setThumbnailMode] = useThumbnailMode();

  const loadLibraries = useCallback(async () => {
    try {
      const data = await getLibraries();
      setLibraries(data.libraries);
      setActiveIndex(data.active_index);
    } catch (err) {
      console.error("Failed to load libraries:", err);
    }
  }, []);

  const loadSizes = useCallback(async () => {
    try {
      const sizes = await getStorageSizes();
      setProjectsSize(sizes.projects_size);
      setDeletedSize(sizes.deleted_size);
    } catch (err) {
      console.error("Failed to load storage sizes:", err);
    }
  }, []);

  useEffect(() => {
    loadLibraries();
    loadSizes();
  }, [loadLibraries, loadSizes]);

  async function handleAddLibrary() {
    const selected = await open({ directory: true, multiple: false });
    if (!selected) return;
    const path = typeof selected === "string" ? selected : (selected as { path: string }).path;
    if (!path) return;
    // Use folder name as default library name
    const name = path.split("/").pop() || "Library";
    await addLibrary(name, path);
    await loadLibraries();
  }

  async function handleSwitch(index: number) {
    if (index === activeIndex) return;
    await switchLibrary(index);
    await loadLibraries();
    await loadSizes();
    onLibraryChanged();
  }

  async function handleRemove(index: number) {
    setShowRemoveConfirm(null);
    const wasActive = index === activeIndex;
    await removeLibrary(index);
    await loadLibraries();
    if (wasActive) {
      await loadSizes();
      onLibraryChanged();
    }
  }

  function startRename(index: number) {
    setEditingName(index);
    setEditNameValue(libraries[index].name);
  }

  async function commitRename() {
    if (editingName === null) return;
    const trimmed = editNameValue.trim();
    if (trimmed && trimmed !== libraries[editingName].name) {
      await renameLibrary(editingName, trimmed);
      await loadLibraries();
    }
    setEditingName(null);
  }

  async function handleEmptyTrash() {
    setEmptyingTrash(true);
    try {
      await emptyTrash();
      setShowEmptyTrashConfirm(false);
      await loadSizes();
    } finally {
      setEmptyingTrash(false);
    }
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
        <h1 className="text-lg font-semibold text-gray-900 dark:text-gray-100">Settings</h1>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto">
        <div className="max-w-2xl mx-auto p-6 space-y-8">
          {/* Libraries */}
          <div>
            <div className="flex items-center justify-between mb-1">
              <h2 className="text-sm font-semibold text-gray-900 dark:text-gray-100">Libraries</h2>
              <button
                onClick={handleAddLibrary}
                className="text-xs text-indigo-500 hover:text-indigo-600 dark:text-indigo-400 dark:hover:text-indigo-300 cursor-pointer font-medium"
              >
                + Add library
              </button>
            </div>
            <p className="text-xs text-gray-500 dark:text-gray-400 mb-3">
              Manage where your projects are stored. Click to switch active library.
            </p>
            <div className="space-y-2">
              {libraries.map((lib, i) => {
                const isActive = i === activeIndex;
                return (
                  <div
                    key={`${lib.path}-${i}`}
                    className={`flex items-center gap-3 px-3 py-2.5 rounded-lg border transition-colors ${
                      isActive
                        ? "border-indigo-400 bg-indigo-50 dark:bg-indigo-900/20 dark:border-indigo-500"
                        : "border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800"
                    }`}
                  >
                    {/* Active indicator / switch button */}
                    <button
                      onClick={() => handleSwitch(i)}
                      className={`w-4 h-4 rounded-full border-2 shrink-0 cursor-pointer transition-colors flex items-center justify-center ${
                        isActive
                          ? "border-indigo-500 bg-indigo-500"
                          : "border-gray-300 dark:border-gray-500 hover:border-indigo-400"
                      }`}
                      title={isActive ? "Active library" : "Switch to this library"}
                    >
                      {isActive && (
                        <div className="w-1.5 h-1.5 rounded-full bg-white" />
                      )}
                    </button>

                    {/* Name and path */}
                    <div className="flex-1 min-w-0">
                      {editingName === i ? (
                        <input
                          type="text"
                          value={editNameValue}
                          onChange={(e) => setEditNameValue(e.target.value)}
                          onBlur={commitRename}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") commitRename();
                            if (e.key === "Escape") setEditingName(null);
                          }}
                          autoFocus
                          className="text-sm font-medium bg-white dark:bg-gray-700 border border-indigo-400 rounded px-1.5 py-0.5 w-full text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-1 focus:ring-indigo-400"
                        />
                      ) : (
                        <button
                          onClick={() => startRename(i)}
                          className="text-sm font-medium text-gray-900 dark:text-gray-100 cursor-pointer hover:text-indigo-500 dark:hover:text-indigo-400 truncate block text-left"
                          title="Click to rename"
                        >
                          {lib.name}
                        </button>
                      )}
                      <div className="text-[11px] text-gray-400 dark:text-gray-500 truncate font-mono" title={lib.path}>
                        {lib.path.replace(/^\/Users\/[^/]+/, "~")}
                      </div>
                    </div>

                    {/* Remove button */}
                    {libraries.length > 1 && (
                      <button
                        onClick={() => setShowRemoveConfirm(i)}
                        className="p-1 text-gray-300 hover:text-red-500 dark:text-gray-600 dark:hover:text-red-400 cursor-pointer transition-colors shrink-0"
                        title="Remove library"
                      >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                        </svg>
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          {/* Storage */}
          <div>
            <h2 className="text-sm font-semibold text-gray-900 dark:text-gray-100 mb-1">Storage</h2>
            <p className="text-xs text-gray-500 dark:text-gray-400 mb-3">
              Disk space used by the active library.
            </p>
            <div className="space-y-3">
              <div className="flex items-center justify-between px-3 py-2.5 bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg">
                <div className="flex items-center gap-2">
                  <svg className="w-4 h-4 text-indigo-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
                  </svg>
                  <span className="text-sm text-gray-700 dark:text-gray-300">Projects</span>
                </div>
                <span className="text-sm font-medium text-gray-900 dark:text-gray-100">
                  {projectsSize !== null ? formatBytes(projectsSize) : "..."}
                </span>
              </div>

              <div className="flex items-center justify-between px-3 py-2.5 bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg">
                <div className="flex items-center gap-2">
                  <svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                  </svg>
                  <span className="text-sm text-gray-700 dark:text-gray-300">Deleted items</span>
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-sm font-medium text-gray-900 dark:text-gray-100">
                    {deletedSize !== null ? formatBytes(deletedSize) : "..."}
                  </span>
                  {deletedSize !== null && deletedSize > 0 && (
                    <button
                      onClick={() => setShowEmptyTrashConfirm(true)}
                      className="p-1 text-gray-400 hover:text-red-500 dark:text-gray-500 dark:hover:text-red-400 cursor-pointer transition-colors"
                      title="Empty trash"
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                      </svg>
                    </button>
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* Appearance */}
          <div>
            <h2 className="text-sm font-semibold text-gray-900 dark:text-gray-100 mb-1">Appearance</h2>
            <p className="text-xs text-gray-500 dark:text-gray-400 mb-3">
              Choose your preferred color theme.
            </p>
            <div className="flex gap-2">
              {([
                { value: "light" as Theme, label: "Light", icon: (
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707M16 12a4 4 0 11-8 0 4 4 0 018 0z" />
                  </svg>
                )},
                { value: "dark" as Theme, label: "Dark", icon: (
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z" />
                  </svg>
                )},
                { value: "system" as Theme, label: "System", icon: (
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                  </svg>
                )},
              ]).map((opt) => (
                <button
                  key={opt.value}
                  onClick={() => setTheme(opt.value)}
                  className={`flex items-center gap-2 px-4 py-2 text-sm rounded-lg border transition-colors cursor-pointer ${
                    theme === opt.value
                      ? "border-indigo-400 bg-indigo-50 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-300 font-medium"
                      : "border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700"
                  }`}
                >
                  {opt.icon}
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          {/* Thumbnails */}
          <div>
            <h2 className="text-sm font-semibold text-gray-900 dark:text-gray-100 mb-1">Thumbnails</h2>
            <p className="text-xs text-gray-500 dark:text-gray-400 mb-3">
              How project thumbnails are displayed in the grid.
            </p>
            <div className="flex gap-3">
              {([
                { value: "cover" as ThumbnailMode, label: "Fill", description: "Fills the card, may crop" },
                { value: "full" as ThumbnailMode, label: "Half", description: "In between Fill and Fit" },
                { value: "contain" as ThumbnailMode, label: "Fit", description: "Scales to fit the card" },
              ]).map((opt) => (
                <button
                  key={opt.value}
                  onClick={() => setThumbnailMode(opt.value)}
                  className={`flex-1 flex flex-col items-center gap-2 p-3 rounded-lg border transition-colors cursor-pointer ${
                    thumbnailMode === opt.value
                      ? "border-indigo-400 bg-indigo-50 dark:bg-indigo-900/30"
                      : "border-gray-300 dark:border-gray-600 hover:bg-gray-100 dark:hover:bg-gray-700"
                  }`}
                >
                  <div className="w-full aspect-[4/3] rounded bg-gray-100 dark:bg-gray-700 flex items-center justify-center overflow-hidden">
                    {opt.value === "cover" ? (
                      <div className="w-full h-full bg-gradient-to-br from-indigo-200 to-indigo-400 dark:from-indigo-700 dark:to-indigo-500" />
                    ) : opt.value === "full" ? (
                      <div className="w-3/5 h-full bg-gradient-to-br from-indigo-200 to-indigo-400 dark:from-indigo-700 dark:to-indigo-500" />
                    ) : (
                      <div className="w-3/5 h-4/5 rounded-sm bg-gradient-to-br from-indigo-200 to-indigo-400 dark:from-indigo-700 dark:to-indigo-500" />
                    )}
                  </div>
                  <div className="text-center">
                    <div className={`text-sm font-medium ${
                      thumbnailMode === opt.value
                        ? "text-indigo-700 dark:text-indigo-300"
                        : "text-gray-700 dark:text-gray-300"
                    }`}>
                      {opt.label}
                    </div>
                    <div className="text-[10px] text-gray-500 dark:text-gray-400">{opt.description}</div>
                  </div>
                </button>
              ))}
            </div>
          </div>

          {/* Filament Management */}
          <div>
            <h2 className="text-sm font-semibold text-gray-900 dark:text-gray-100 mb-1">Filaments</h2>
            <p className="text-xs text-gray-500 dark:text-gray-400 mb-3">
              Manage project filament data and curated filament matching.
            </p>
            <div className="space-y-2">
              <div className="flex flex-wrap gap-2">
                <button
                  onClick={async () => {
                    setRematchingFilaments(true);
                    setRematchResult(null);
                    try {
                      const count = await rematchUnmatchedFilaments();
                      setRematchResult(count);
                    } finally {
                      setRematchingFilaments(false);
                    }
                  }}
                  disabled={rematchingFilaments}
                  className="flex items-center gap-2 px-4 py-2 text-sm rounded-lg border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 cursor-pointer transition-colors disabled:opacity-50"
                >
                  <svg className={`w-4 h-4 ${rematchingFilaments ? "animate-spin" : ""}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
                  </svg>
                  {rematchingFilaments ? "Matching..." : "Rematch Unmatched"}
                </button>
                <button
                  onClick={async () => {
                    setReparsingFilaments(true);
                    setReparseResult(null);
                    try {
                      const count = await reparseAllProjectFilaments();
                      setReparseResult(count);
                    } finally {
                      setReparsingFilaments(false);
                    }
                  }}
                  disabled={reparsingFilaments}
                  className="flex items-center gap-2 px-4 py-2 text-sm rounded-lg border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 cursor-pointer transition-colors disabled:opacity-50"
                >
                  <svg className={`w-4 h-4 ${reparsingFilaments ? "animate-spin" : ""}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                  </svg>
                  {reparsingFilaments ? "Reparsing..." : "Reparse All"}
                </button>
                <button
                  onClick={() => setShowClearFilamentsConfirm(true)}
                  className="flex items-center gap-2 px-4 py-2 text-sm rounded-lg border border-red-300 dark:border-red-700 text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 cursor-pointer transition-colors"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                  </svg>
                  Clear Curated
                </button>
              </div>
              {rematchResult !== null && (
                <p className="text-xs text-green-600 dark:text-green-400">
                  Matched {rematchResult} filament{rematchResult !== 1 ? "s" : ""}.
                </p>
              )}
              {reparseResult !== null && (
                <p className="text-xs text-green-600 dark:text-green-400">
                  Reparsed {reparseResult} filament{reparseResult !== 1 ? "s" : ""} across all projects.
                </p>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Remove library confirm dialog */}
      {showRemoveConfirm !== null && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white dark:bg-gray-800 rounded-xl shadow-xl p-6 max-w-md mx-4 space-y-4">
            <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
              Remove Library
            </h2>
            <p className="text-sm text-gray-600 dark:text-gray-400">
              Remove <strong>{libraries[showRemoveConfirm]?.name}</strong> from the list? This will not delete any files on disk.
            </p>
            <div className="flex gap-2 justify-end">
              <button
                onClick={() => setShowRemoveConfirm(null)}
                className="px-4 py-2 text-sm rounded-lg border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 cursor-pointer"
              >
                Cancel
              </button>
              <button
                onClick={() => handleRemove(showRemoveConfirm)}
                className="px-4 py-2 text-sm rounded-lg bg-red-500 text-white hover:bg-red-600 cursor-pointer"
              >
                Remove
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Clear curated filaments confirm dialog */}
      {showClearFilamentsConfirm && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white dark:bg-gray-800 rounded-xl shadow-xl p-6 max-w-md mx-4 space-y-4">
            <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
              Clear All Curated Filaments
            </h2>
            <p className="text-sm text-gray-600 dark:text-gray-400">
              This will delete all curated filaments and unlink them from all projects. You can re-import them later. This cannot be undone.
            </p>
            <div className="flex gap-2 justify-end">
              <button
                onClick={() => setShowClearFilamentsConfirm(false)}
                disabled={clearingFilaments}
                className="px-4 py-2 text-sm rounded-lg border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 cursor-pointer disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                onClick={async () => {
                  setClearingFilaments(true);
                  try {
                    await clearAllCuratedFilaments();
                    setShowClearFilamentsConfirm(false);
                  } finally {
                    setClearingFilaments(false);
                  }
                }}
                disabled={clearingFilaments}
                className="px-4 py-2 text-sm rounded-lg bg-red-500 text-white hover:bg-red-600 cursor-pointer disabled:opacity-50"
              >
                {clearingFilaments ? "Clearing..." : "Clear All"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Empty trash confirm dialog */}
      {showEmptyTrashConfirm && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white dark:bg-gray-800 rounded-xl shadow-xl p-6 max-w-md mx-4 space-y-4">
            <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
              Empty Trash
            </h2>
            <p className="text-sm text-gray-600 dark:text-gray-400">
              This will permanently delete {deletedSize !== null ? formatBytes(deletedSize) : ""} of data. This cannot be undone.
            </p>
            <div className="flex gap-2 justify-end">
              <button
                onClick={() => setShowEmptyTrashConfirm(false)}
                disabled={emptyingTrash}
                className="px-4 py-2 text-sm rounded-lg border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 cursor-pointer disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                onClick={handleEmptyTrash}
                disabled={emptyingTrash}
                className="px-4 py-2 text-sm rounded-lg bg-red-500 text-white hover:bg-red-600 cursor-pointer disabled:opacity-50"
              >
                {emptyingTrash ? "Deleting..." : "Delete Permanently"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
