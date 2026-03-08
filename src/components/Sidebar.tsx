import { useCallback, useEffect, useState } from "react";
import { listTags, listCollections, listAllFilaments, listAllSizes } from "../lib/api";
import type { TagWithCount, Collection, FilamentInfo } from "../lib/types";
import TagManager from "./TagManager";
import CollectionManager from "./CollectionManager";
import { onDragMouseDown } from "../hooks/useDrag";

interface SidebarProps {
  selectedTags: string[];
  onTagsChange: (tags: string[]) => void;
  selectedCollection: string | undefined;
  onCollectionChange: (id: string | undefined) => void;
  selectedFilaments: string[];
  onFilamentsChange: (filaments: string[]) => void;
  selectedSize: string | undefined;
  onSizeChange: (size: string | undefined) => void;
  refreshKey?: number;
  hasSearch?: boolean;
  onClearAll?: () => void;
}

export default function Sidebar({
  selectedTags,
  onTagsChange,
  selectedCollection,
  onCollectionChange,
  selectedFilaments,
  onFilamentsChange,
  selectedSize,
  onSizeChange,
  refreshKey,
  hasSearch,
  onClearAll,
}: SidebarProps) {
  const [tags, setTags] = useState<TagWithCount[]>([]);
  const [collections, setCollections] = useState<Collection[]>([]);
  const [filaments, setFilaments] = useState<FilamentInfo[]>([]);
  const [sizes, setSizes] = useState<string[]>([]);
  const [showTagManager, setShowTagManager] = useState(false);
  const [showCollectionManager, setShowCollectionManager] = useState(false);

  const loadFilters = useCallback(async () => {
    const [t, c, fl, sz] = await Promise.all([
      listTags(), listCollections(), listAllFilaments(), listAllSizes(),
    ]);
    setTags(t);
    setCollections(c);
    setFilaments(fl);
    setSizes(sz);
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
    onFilamentsChange([]);
    onSizeChange(undefined);
  }

  const hasFilters =
    hasSearch ||
    selectedTags.length > 0 ||
    selectedCollection !== undefined ||
    selectedFilaments.length > 0 ||
    selectedSize !== undefined;

  return (
    <>
      <aside className="w-56 shrink-0 border-r border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900 flex flex-col">
        {/* Logo header */}
        <div className="px-4 py-3 pt-10 border-b border-gray-200 dark:border-gray-700 shrink-0 flex items-center" onMouseDown={onDragMouseDown}>
          <div className="flex items-center gap-2.5 h-[36px]">
            <svg className="w-6 h-6 text-indigo-500 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
            </svg>
            <span className="text-sm font-bold text-gray-900 dark:text-gray-100">
              HF Library Manager
            </span>
          </div>
        </div>

        {/* Scrollable content */}
        <div className="flex-1 overflow-y-auto p-4 flex flex-col gap-5">

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

        </div>

        {/* Fixed footer */}
        {hasFilters && (
          <div className="shrink-0 border-t border-gray-200 dark:border-gray-700 px-4 py-3">
            <button
              onClick={onClearAll || clearAll}
              className="w-full text-xs text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 cursor-pointer transition-colors py-1.5 px-3 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-800"
            >
              Clear all filters
            </button>
          </div>
        )}
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

    </>
  );
}
