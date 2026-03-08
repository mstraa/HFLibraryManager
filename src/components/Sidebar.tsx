import { useCallback, useEffect, useState } from "react";
import { open } from "@tauri-apps/plugin-dialog";
import { listTags, listCollections, listCreators, listAllFilaments, listAllSizes, getLibraryPath, setLibraryPath } from "../lib/api";
import type { TagWithCount, Collection, FilamentInfo } from "../lib/types";
import TagManager from "./TagManager";
import CollectionManager from "./CollectionManager";

interface SidebarProps {
  selectedTags: string[];
  onTagsChange: (tags: string[]) => void;
  selectedCollection: string | undefined;
  onCollectionChange: (id: string | undefined) => void;
  selectedCreator: string | undefined;
  onCreatorChange: (creator: string | undefined) => void;
  selectedFilaments: string[];
  onFilamentsChange: (filaments: string[]) => void;
  selectedSize: string | undefined;
  onSizeChange: (size: string | undefined) => void;
  onCreateProject: () => void;
  refreshKey?: number;
  hasSearch?: boolean;
  onClearAll?: () => void;
}

export default function Sidebar({
  selectedTags,
  onTagsChange,
  selectedCollection,
  onCollectionChange,
  selectedCreator,
  onCreatorChange,
  selectedFilaments,
  onFilamentsChange,
  selectedSize,
  onSizeChange,
  onCreateProject,
  refreshKey,
  hasSearch,
  onClearAll,
}: SidebarProps) {
  const [tags, setTags] = useState<TagWithCount[]>([]);
  const [collections, setCollections] = useState<Collection[]>([]);
  const [creators, setCreators] = useState<string[]>([]);
  const [filaments, setFilaments] = useState<FilamentInfo[]>([]);
  const [sizes, setSizes] = useState<string[]>([]);
  const [showTagManager, setShowTagManager] = useState(false);
  const [showCollectionManager, setShowCollectionManager] = useState(false);
  const [libraryPath, setLibraryPathState] = useState("");
  const [showMoveConfirm, setShowMoveConfirm] = useState(false);
  const [pendingPath, setPendingPath] = useState("");

  const loadFilters = useCallback(async () => {
    const [t, c, cr, fl, sz, lp] = await Promise.all([
      listTags(), listCollections(), listCreators(), listAllFilaments(), listAllSizes(), getLibraryPath(),
    ]);
    setTags(t);
    setCollections(c);
    setCreators(cr);
    setFilaments(fl);
    setSizes(sz);
    setLibraryPathState(lp);
  }, []);

  useEffect(() => {
    loadFilters();
  }, [loadFilters, refreshKey]);

  function toggleTag(id: string) {
    if (selectedTags.includes(id)) {
      onTagsChange(selectedTags.filter((t) => t !== id));
    } else {
      onTagsChange([...selectedTags, id]);
    }
  }

  function clearAll() {
    onTagsChange([]);
    onCollectionChange(undefined);
    onCreatorChange(undefined);
    onFilamentsChange([]);
    onSizeChange(undefined);
  }

  const hasFilters =
    hasSearch ||
    selectedTags.length > 0 ||
    selectedCollection !== undefined ||
    selectedCreator !== undefined ||
    selectedFilaments.length > 0 ||
    selectedSize !== undefined;

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
    // App needs restart to re-open DB at new location
    window.location.reload();
  }

  return (
    <>
      <aside className="w-56 shrink-0 border-r border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900 p-4 pt-10 flex flex-col gap-5 overflow-y-auto">
        <button
          onClick={onCreateProject}
          className="w-full py-2 px-4 bg-indigo-500 hover:bg-indigo-600 text-white rounded-lg text-sm font-medium transition-colors cursor-pointer"
        >
          + New Project
        </button>

        {hasFilters && (
          <button
            onClick={onClearAll || clearAll}
            className="text-xs text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 underline cursor-pointer -mt-3"
          >
            Clear all filters
          </button>
        )}

        {/* Collections */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">
              Collections
            </h3>
            <button
              onClick={() => setShowCollectionManager(true)}
              className="text-gray-400 hover:text-indigo-500 cursor-pointer"
              title="Manage collections"
            >
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
              </svg>
            </button>
          </div>
          <ul className="space-y-1">
            <li>
              <button
                onClick={() => onCollectionChange(undefined)}
                className={`w-full text-left text-sm px-2 py-1 rounded cursor-pointer transition-colors ${
                  selectedCollection === undefined
                    ? "bg-indigo-100 dark:bg-indigo-900 text-indigo-700 dark:text-indigo-300 font-medium"
                    : "text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-800"
                }`}
              >
                All Projects
              </button>
            </li>
            {collections.map((c) => (
              <li key={c.id}>
                <button
                  onClick={() => onCollectionChange(c.id)}
                  className={`w-full text-left text-sm px-2 py-1 rounded cursor-pointer transition-colors ${
                    selectedCollection === c.id
                      ? "bg-indigo-100 dark:bg-indigo-900 text-indigo-700 dark:text-indigo-300 font-medium"
                      : "text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-800"
                  }`}
                >
                  {c.name}
                  <span className="text-gray-400 dark:text-gray-500 ml-1 text-xs">
                    {c.project_count}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </div>

        {/* Tags */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">
              Tags
            </h3>
            <button
              onClick={() => setShowTagManager(true)}
              className="text-gray-400 hover:text-indigo-500 cursor-pointer"
              title="Manage tags"
            >
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
              </svg>
            </button>
          </div>
          {tags.length === 0 ? (
            <p className="text-xs text-gray-400 dark:text-gray-500">
              No tags yet.{" "}
              <button onClick={() => setShowTagManager(true)} className="text-indigo-500 hover:underline cursor-pointer">
                Create one
              </button>
            </p>
          ) : (
            <div className="flex flex-wrap gap-1.5">
              {tags.map((t) => (
                <button
                  key={t.id}
                  onClick={() => toggleTag(t.id)}
                  className={`text-xs px-2 py-0.5 rounded-full transition-all cursor-pointer border ${
                    selectedTags.includes(t.id)
                      ? "ring-2 ring-offset-1 ring-indigo-400"
                      : "opacity-70 hover:opacity-100"
                  }`}
                  style={{
                    backgroundColor: t.color + "22",
                    borderColor: t.color,
                    color: t.color,
                  }}
                >
                  {t.name}
                  <span className="ml-0.5 opacity-60">{t.project_count}</span>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Creator */}
        {creators.length > 0 && (
          <div>
            <h3 className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-2">
              Creator
            </h3>
            <ul className="space-y-1">
              <li>
                <button
                  onClick={() => onCreatorChange(undefined)}
                  className={`w-full text-left text-sm px-2 py-1 rounded cursor-pointer transition-colors ${
                    selectedCreator === undefined
                      ? "bg-indigo-100 dark:bg-indigo-900 text-indigo-700 dark:text-indigo-300 font-medium"
                      : "text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-800"
                  }`}
                >
                  All Creators
                </button>
              </li>
              {creators.map((cr) => (
                <li key={cr}>
                  <button
                    onClick={() => onCreatorChange(cr)}
                    className={`w-full text-left text-sm px-2 py-1 rounded cursor-pointer transition-colors ${
                      selectedCreator === cr
                        ? "bg-indigo-100 dark:bg-indigo-900 text-indigo-700 dark:text-indigo-300 font-medium"
                        : "text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-800"
                    }`}
                  >
                    {cr}
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* Filaments */}
        {filaments.length > 0 && (
          <div>
            <h3 className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-2">
              Filaments
            </h3>
            <ul className="space-y-0.5">
              {filaments.map((f) => {
                const key = f.color.toLowerCase();
                const isActive = selectedFilaments.includes(key);
                return (
                  <li key={key}>
                    <button
                      onClick={() => {
                        if (isActive) {
                          onFilamentsChange(selectedFilaments.filter((k) => k !== key));
                        } else {
                          onFilamentsChange([...selectedFilaments, key]);
                        }
                      }}
                      className={`w-full flex items-center gap-2 text-xs px-2 py-1 rounded cursor-pointer transition-colors ${
                        isActive
                          ? "bg-indigo-100 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-300 font-medium"
                          : "text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-800"
                      }`}
                      title={`${f.brand} ${f.name} (${f.color})`}
                    >
                      <span
                        className="w-3 h-3 rounded-full shrink-0 border border-gray-300 dark:border-gray-500"
                        style={{ backgroundColor: f.color }}
                      />
                      <span className="truncate">{f.brand} {f.name}</span>
                    </button>
                  </li>
                );
              })}
            </ul>
          </div>
        )}

        {/* Sizes */}
        {sizes.length > 0 && (
          <div>
            <h3 className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-2">
              Sizes
            </h3>
            <div className="flex flex-wrap gap-1.5">
              {sizes.map((s) => {
                const isActive = selectedSize === s;
                return (
                  <button
                    key={s}
                    onClick={() => onSizeChange(isActive ? undefined : s)}
                    className={`text-xs px-2 py-0.5 rounded-full transition-all cursor-pointer border border-gray-300 dark:border-gray-600 ${
                      isActive
                        ? "ring-2 ring-offset-1 ring-indigo-400 bg-indigo-50 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-300"
                        : "text-gray-600 dark:text-gray-400 opacity-70 hover:opacity-100"
                    }`}
                  >
                    {s}
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* Spacer */}
        <div className="flex-1" />

        {/* Library path */}
        <div className="border-t border-gray-200 dark:border-gray-700 pt-3">
          <h3 className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-1">
            Library
          </h3>
          <button
            onClick={handleChangeLibraryPath}
            className="w-full text-left text-xs text-gray-500 dark:text-gray-400 hover:text-indigo-500 dark:hover:text-indigo-400 cursor-pointer truncate transition-colors"
            title={libraryPath}
          >
            {libraryPath.replace(/^\/Users\/[^/]+/, "~")}
          </button>
        </div>
      </aside>

      <TagManager
        open={showTagManager}
        onClose={() => setShowTagManager(false)}
        tags={tags}
        onRefresh={loadFilters}
      />

      <CollectionManager
        open={showCollectionManager}
        onClose={() => setShowCollectionManager(false)}
        collections={collections}
        onRefresh={loadFilters}
      />

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
    </>
  );
}
