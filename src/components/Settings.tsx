import { useCallback, useEffect, useState } from "react";
import { open } from "@tauri-apps/plugin-dialog";
import { getLibraryPath, setLibraryPath, getStorageSizes, emptyTrash } from "../lib/api";
import { onDragMouseDown } from "../hooks/useDrag";
import { useTheme, type Theme } from "../hooks/useTheme";
import { useThumbnailMode } from "../hooks/useThumbnailMode";
import type { ThumbnailMode } from "../lib/types";

interface SettingsProps {
  onBack: () => void;
}

function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 B";
  const units = ["B", "KB", "MB", "GB", "TB"];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  const value = bytes / Math.pow(1024, i);
  return `${value < 10 ? value.toFixed(1) : Math.round(value)} ${units[i]}`;
}

export default function Settings({ onBack }: SettingsProps) {
  const [libraryPath, setLibraryPathState] = useState("");
  const [showMoveConfirm, setShowMoveConfirm] = useState(false);
  const [pendingPath, setPendingPath] = useState("");
  const [projectsSize, setProjectsSize] = useState<number | null>(null);
  const [deletedSize, setDeletedSize] = useState<number | null>(null);
  const [showEmptyTrashConfirm, setShowEmptyTrashConfirm] = useState(false);
  const [emptyingTrash, setEmptyingTrash] = useState(false);
  const { theme, setTheme } = useTheme();
  const [thumbnailMode, setThumbnailMode] = useThumbnailMode();

  const loadSizes = useCallback(async () => {
    const sizes = await getStorageSizes();
    setProjectsSize(sizes.projects_size);
    setDeletedSize(sizes.deleted_size);
  }, []);

  useEffect(() => {
    getLibraryPath().then(setLibraryPathState);
    loadSizes();
  }, [loadSizes]);

  async function handleChangeLibraryPath() {
    const selected = await open({ directory: true, multiple: false });
    if (!selected) return;
    const newPath = typeof selected === "string" ? selected : (selected as { path: string }).path;
    if (!newPath || newPath === libraryPath) return;
    setPendingPath(newPath);
    setShowMoveConfirm(true);
  }

  async function confirmChangeLibraryPath(moveData: boolean) {
    setShowMoveConfirm(false);
    await setLibraryPath(pendingPath, moveData);
    setLibraryPathState(pendingPath);
    window.location.reload();
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
          {/* Library Location */}
          <div>
            <h2 className="text-sm font-semibold text-gray-900 dark:text-gray-100 mb-1">Library Location</h2>
            <p className="text-xs text-gray-500 dark:text-gray-400 mb-3">
              Where your projects and files are stored on disk.
            </p>
            <div className="flex items-center gap-3">
              <div className="flex-1 px-3 py-2 text-sm bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg text-gray-700 dark:text-gray-300 truncate font-mono">
                {libraryPath}
              </div>
              <button
                onClick={handleChangeLibraryPath}
                className="px-4 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors cursor-pointer shrink-0"
              >
                Change...
              </button>
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
                { value: "contain" as ThumbnailMode, label: "Fit", description: "Scales to fit the card" },
                { value: "full" as ThumbnailMode, label: "Full", description: "Natural size, never scales up" },
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
                  {/* Preview illustration */}
                  <div className="w-full aspect-[4/3] rounded bg-gray-100 dark:bg-gray-700 flex items-center justify-center overflow-hidden">
                    {opt.value === "cover" ? (
                      <div className="w-full h-full bg-gradient-to-br from-indigo-200 to-indigo-400 dark:from-indigo-700 dark:to-indigo-500" />
                    ) : opt.value === "contain" ? (
                      <div className="w-3/5 h-4/5 rounded-sm bg-gradient-to-br from-indigo-200 to-indigo-400 dark:from-indigo-700 dark:to-indigo-500" />
                    ) : (
                      <div className="w-2/5 h-2/5 rounded-sm bg-gradient-to-br from-indigo-200 to-indigo-400 dark:from-indigo-700 dark:to-indigo-500" />
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

          {/* Storage */}
          <div>
            <h2 className="text-sm font-semibold text-gray-900 dark:text-gray-100 mb-1">Storage</h2>
            <p className="text-xs text-gray-500 dark:text-gray-400 mb-3">
              Disk space used by your library.
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
                      className="text-xs text-red-500 hover:text-red-600 dark:text-red-400 dark:hover:text-red-300 cursor-pointer hover:underline"
                    >
                      Empty trash
                    </button>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Move confirm dialog */}
      {showMoveConfirm && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white dark:bg-gray-800 rounded-xl shadow-xl p-6 max-w-md mx-4 space-y-4">
            <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
              Change Library Location
            </h2>
            <p className="text-sm text-gray-600 dark:text-gray-400">
              Move library to: <br />
              <span className="font-mono text-xs text-indigo-500">{pendingPath}</span>
            </p>
            <p className="text-sm text-gray-600 dark:text-gray-400">
              Do you want to move your existing projects to the new location?
            </p>
            <div className="flex gap-2 justify-end">
              <button
                onClick={() => setShowMoveConfirm(false)}
                className="px-4 py-2 text-sm rounded-lg border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 cursor-pointer"
              >
                Cancel
              </button>
              <button
                onClick={() => confirmChangeLibraryPath(false)}
                className="px-4 py-2 text-sm rounded-lg bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-300 dark:hover:bg-gray-600 cursor-pointer"
              >
                Don't Move
              </button>
              <button
                onClick={() => confirmChangeLibraryPath(true)}
                className="px-4 py-2 text-sm rounded-lg bg-indigo-500 text-white hover:bg-indigo-600 cursor-pointer"
              >
                Move Data
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
