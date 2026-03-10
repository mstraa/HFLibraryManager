import { useCallback, useEffect, useState } from "react";
import { listTags, listCollections, listUsedCuratedFilaments, listAllSizes } from "../lib/api";
import type { TagWithCount, Collection, CuratedFilamentWithCount } from "../lib/types";
import TagManager from "./TagManager";
import CollectionManager from "./CollectionManager";
import { onDragMouseDown } from "../hooks/useDrag";

const STORAGE_KEY = "sidebar-collapsed";

type SectionKey = "collections" | "tags" | "filaments" | "sizes";

function loadCollapsed(): Record<SectionKey, boolean> {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) return JSON.parse(stored);
  } catch { /* ignore */ }
  return { collections: false, tags: false, filaments: false, sizes: false };
}

function saveCollapsed(state: Record<SectionKey, boolean>) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

interface SidebarProps {
  selectedTags: string[];
  onTagsChange: (tags: string[]) => void;
  excludedTags: string[];
  onExcludedTagsChange: (tags: string[]) => void;
  selectedCollection: string | undefined;
  onCollectionChange: (id: string | undefined) => void;
  selectedFilaments: string[];
  onFilamentsChange: (filaments: string[]) => void;
  excludedFilaments: string[];
  onExcludedFilamentsChange: (filaments: string[]) => void;
  noFilamentFilter: "include" | "exclude" | undefined;
  onNoFilamentFilterChange: (v: "include" | "exclude" | undefined) => void;
  selectedSize: string | undefined;
  onSizeChange: (size: string | undefined) => void;
  excludedSizes: string[];
  onExcludedSizesChange: (sizes: string[]) => void;
  ownedOnly: boolean;
  onOwnedOnlyChange: (v: boolean) => void;
  allOwned: boolean;
  onAllOwnedChange: (v: boolean) => void;
  refreshKey?: number;
  hasSearch?: boolean;
  onClearAll?: () => void;
}

export default function Sidebar({
  selectedTags,
  onTagsChange,
  excludedTags,
  onExcludedTagsChange,
  selectedCollection,
  onCollectionChange,
  selectedFilaments,
  onFilamentsChange,
  excludedFilaments,
  onExcludedFilamentsChange,
  noFilamentFilter,
  onNoFilamentFilterChange,
  selectedSize,
  onSizeChange,
  excludedSizes,
  onExcludedSizesChange,
  ownedOnly,
  onOwnedOnlyChange,
  allOwned,
  onAllOwnedChange,
  refreshKey,
  hasSearch,
  onClearAll,
}: SidebarProps) {
  const [tags, setTags] = useState<TagWithCount[]>([]);
  const [collections, setCollections] = useState<Collection[]>([]);
  const [filaments, setFilaments] = useState<CuratedFilamentWithCount[]>([]);
  const [sizes, setSizes] = useState<string[]>([]);
  const [showTagManager, setShowTagManager] = useState(false);
  const [showCollectionManager, setShowCollectionManager] = useState(false);
  const [collapsed, setCollapsed] = useState<Record<SectionKey, boolean>>(loadCollapsed);
  const [filamentSearch, setFilamentSearch] = useState("");

  function toggleSection(key: SectionKey) {
    setCollapsed((prev) => {
      const next = { ...prev, [key]: !prev[key] };
      saveCollapsed(next);
      return next;
    });
  }

  const loadFilters = useCallback(async () => {
    const [t, c, fl, sz] = await Promise.all([
      listTags(), listCollections(), listUsedCuratedFilaments(), listAllSizes(),
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
    if (excludedTags.includes(id)) {
      onExcludedTagsChange(excludedTags.filter((t) => t !== id));
      return;
    }
    if (selectedTags.includes(id)) {
      onTagsChange(selectedTags.filter((t) => t !== id));
    } else {
      onTagsChange([...selectedTags, id]);
    }
  }

  function excludeTag(id: string) {
    if (selectedTags.includes(id)) {
      onTagsChange(selectedTags.filter((t) => t !== id));
    }
    if (excludedTags.includes(id)) {
      onExcludedTagsChange(excludedTags.filter((t) => t !== id));
    } else {
      onExcludedTagsChange([...excludedTags, id]);
    }
  }

  function toggleFilament(id: string) {
    if (excludedFilaments.includes(id)) {
      onExcludedFilamentsChange(excludedFilaments.filter((k) => k !== id));
      return;
    }
    if (selectedFilaments.includes(id)) {
      onFilamentsChange(selectedFilaments.filter((k) => k !== id));
    } else {
      onFilamentsChange([...selectedFilaments, id]);
    }
  }

  function toggleNoFilament() {
    if (noFilamentFilter === "exclude") {
      onNoFilamentFilterChange(undefined);
      return;
    }
    if (noFilamentFilter === "include") {
      onNoFilamentFilterChange(undefined);
    } else {
      onNoFilamentFilterChange("include");
    }
  }

  function excludeNoFilament() {
    if (noFilamentFilter === "include") {
      onNoFilamentFilterChange(undefined);
    }
    if (noFilamentFilter === "exclude") {
      onNoFilamentFilterChange(undefined);
    } else {
      onNoFilamentFilterChange("exclude");
    }
  }

  function excludeFilament(id: string) {
    if (selectedFilaments.includes(id)) {
      onFilamentsChange(selectedFilaments.filter((k) => k !== id));
    }
    if (excludedFilaments.includes(id)) {
      onExcludedFilamentsChange(excludedFilaments.filter((k) => k !== id));
    } else {
      onExcludedFilamentsChange([...excludedFilaments, id]);
    }
  }

  function toggleSize(s: string) {
    if (excludedSizes.includes(s)) {
      onExcludedSizesChange(excludedSizes.filter((x) => x !== s));
      return;
    }
    onSizeChange(selectedSize === s ? undefined : s);
  }

  function excludeSize(s: string) {
    if (selectedSize === s) {
      onSizeChange(undefined);
    }
    if (excludedSizes.includes(s)) {
      onExcludedSizesChange(excludedSizes.filter((x) => x !== s));
    } else {
      onExcludedSizesChange([...excludedSizes, s]);
    }
  }

  function clearAll() {
    onTagsChange([]);
    onExcludedTagsChange([]);
    onCollectionChange(undefined);
    onFilamentsChange([]);
    onExcludedFilamentsChange([]);
    onNoFilamentFilterChange(undefined);
    onOwnedOnlyChange(false);
    onAllOwnedChange(false);
    onSizeChange(undefined);
    onExcludedSizesChange([]);
  }

  // Filter the curated filaments shown in sidebar by owned toggle and search
  const displayFilaments = filaments.filter(f => {
    if (ownedOnly && !f.owned) return false;
    if (!filamentSearch) return true;
    const q = filamentSearch.toLowerCase();
    return f.brand.toLowerCase().includes(q) || f.name.toLowerCase().includes(q) || f.line.toLowerCase().includes(q);
  });

  const hasFilters =
    hasSearch ||
    selectedTags.length > 0 ||
    excludedTags.length > 0 ||
    selectedCollection !== undefined ||
    selectedFilaments.length > 0 ||
    excludedFilaments.length > 0 ||
    selectedSize !== undefined ||
    excludedSizes.length > 0 ||
    ownedOnly ||
    allOwned;

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
        <div className="flex-1 overflow-y-auto p-4 flex flex-col gap-5 select-none">

        {/* Collections */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <button onClick={() => toggleSection("collections")} className="flex items-center gap-1 cursor-pointer group">
              <svg
                className={`w-3 h-3 text-gray-400 dark:text-gray-500 transition-transform ${collapsed.collections ? "" : "rotate-90"}`}
                fill="none" stroke="currentColor" viewBox="0 0 24 24"
              >
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </svg>
              <h3 className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider group-hover:text-gray-700 dark:group-hover:text-gray-300 transition-colors">
                Collections
              </h3>
            </button>
            {!collapsed.collections && (
              <button
                onClick={() => setShowCollectionManager(true)}
                className="text-gray-400 hover:text-indigo-500 cursor-pointer"
                title="Manage collections"
              >
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
                </svg>
              </button>
            )}
          </div>
          {!collapsed.collections && (
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
          )}
        </div>

        {/* Tags */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <button onClick={() => toggleSection("tags")} className="flex items-center gap-1 cursor-pointer group">
              <svg
                className={`w-3 h-3 text-gray-400 dark:text-gray-500 transition-transform ${collapsed.tags ? "" : "rotate-90"}`}
                fill="none" stroke="currentColor" viewBox="0 0 24 24"
              >
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </svg>
              <h3 className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider group-hover:text-gray-700 dark:group-hover:text-gray-300 transition-colors">
                Tags
              </h3>
            </button>
            {!collapsed.tags && (
              <button
                onClick={() => setShowTagManager(true)}
                className="text-gray-400 hover:text-indigo-500 cursor-pointer"
                title="Manage tags"
              >
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
                </svg>
              </button>
            )}
          </div>
          {!collapsed.tags && (
            tags.length === 0 ? (
              <p className="text-xs text-gray-400 dark:text-gray-500">
                No tags yet.{" "}
                <button onClick={() => setShowTagManager(true)} className="text-indigo-500 hover:underline cursor-pointer">
                  Create one
                </button>
              </p>
            ) : (
              <ul className="space-y-0.5">
                {tags.map((t) => {
                  const isActive = selectedTags.includes(t.id);
                  const isExcluded = excludedTags.includes(t.id);
                  return (
                    <li key={t.id}>
                      <button
                        onClick={() => toggleTag(t.id)}
                        onContextMenu={(e) => { e.preventDefault(); excludeTag(t.id); }}
                        className={`w-full flex items-center gap-2 text-xs px-2 py-1 rounded cursor-pointer transition-colors ${
                          isExcluded
                            ? "text-gray-400 dark:text-gray-500 line-through opacity-60"
                            : isActive
                              ? "bg-indigo-100 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-300 font-medium"
                              : "text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-800"
                        }`}
                        title={`${t.name} — Right-click to exclude`}
                      >
                        <span
                          className={`w-3 h-3 rounded-full shrink-0 border ${isExcluded ? "opacity-40" : ""}`}
                          style={{ backgroundColor: t.color || "#ccc", borderColor: t.color || "#ccc" }}
                        />
                        <span className="truncate">{t.name}</span>
                        <span className="ml-auto text-[10px] text-gray-400 dark:text-gray-500 shrink-0">{t.project_count}</span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            )
          )}
        </div>

        {/* Filaments */}
        {filaments.length > 0 && (
          <div>
            <button onClick={() => toggleSection("filaments")} className="flex items-center gap-1 cursor-pointer group mb-2">
              <svg
                className={`w-3 h-3 text-gray-400 dark:text-gray-500 transition-transform ${collapsed.filaments ? "" : "rotate-90"}`}
                fill="none" stroke="currentColor" viewBox="0 0 24 24"
              >
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </svg>
              <h3 className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider group-hover:text-gray-700 dark:group-hover:text-gray-300 transition-colors">
                Filaments
              </h3>
            </button>
            {!collapsed.filaments && (
              <>
              {/* Owned toggles */}
              <div className="flex gap-1 mb-1 w-full">
                <button
                  onClick={() => { if (ownedOnly && allOwned) onAllOwnedChange(false); onOwnedOnlyChange(!ownedOnly); }}
                  className={`flex-1 text-[10px] px-2 py-0.5 rounded cursor-pointer transition-all border ${
                    ownedOnly
                      ? "bg-indigo-100 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-300 border-indigo-300 dark:border-indigo-600 font-medium"
                      : "text-gray-500 dark:text-gray-400 border-gray-300 dark:border-gray-600 hover:border-gray-400 dark:hover:border-gray-500"
                  }`}
                >
                  Owned
                </button>
                <button
                  onClick={() => ownedOnly && onAllOwnedChange(!allOwned)}
                  className={`flex-1 text-[10px] px-2 py-0.5 rounded transition-all border ${
                    !ownedOnly
                      ? "text-gray-300 dark:text-gray-600 border-gray-200 dark:border-gray-700 cursor-not-allowed"
                      : allOwned
                        ? "bg-indigo-100 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-300 border-indigo-300 dark:border-indigo-600 font-medium cursor-pointer"
                        : "text-gray-500 dark:text-gray-400 border-gray-300 dark:border-gray-600 hover:border-gray-400 dark:hover:border-gray-500 cursor-pointer"
                  }`}
                  title={ownedOnly ? "Show only projects where all filaments are owned" : "Enable 'Owned' first"}
                >
                  Strict
                </button>
              </div>
              {filaments.length > 5 && (
                <input
                  type="text"
                  value={filamentSearch}
                  onChange={(e) => setFilamentSearch(e.target.value)}
                  placeholder="Filter filaments..."
                  className="w-full px-2 py-1 mb-1 text-xs bg-gray-100 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded text-gray-900 dark:text-gray-100 placeholder-gray-400 dark:placeholder-gray-500 focus:outline-none focus:ring-1 focus:ring-indigo-400"
                />
              )}
              <ul className="space-y-0.5">
                {!filamentSearch && (
                <li>
                  <button
                    onClick={toggleNoFilament}
                    onContextMenu={(e) => { e.preventDefault(); excludeNoFilament(); }}
                    className={`w-full flex items-center gap-2 text-xs px-2 py-1 rounded cursor-pointer transition-colors ${
                      noFilamentFilter === "exclude"
                        ? "text-gray-400 dark:text-gray-500 line-through opacity-60"
                        : noFilamentFilter === "include"
                          ? "bg-indigo-100 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-300 font-medium"
                          : "text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-800"
                    }`}
                    title="Projects with no filament data — Right-click to exclude"
                  >
                    <span
                      className={`w-3 h-3 rounded-full shrink-0 border border-dashed border-gray-400 dark:border-gray-500 ${noFilamentFilter === "exclude" ? "opacity-40" : ""}`}
                    />
                    <span className="truncate italic">No filament</span>
                  </button>
                </li>
                )}
                {displayFilaments.map((f) => {
                  const isActive = selectedFilaments.includes(f.id);
                  const isExcluded = excludedFilaments.includes(f.id);
                  return (
                    <li key={f.id}>
                      <button
                        onClick={() => toggleFilament(f.id)}
                        onContextMenu={(e) => { e.preventDefault(); excludeFilament(f.id); }}
                        className={`w-full flex items-center gap-2 text-xs px-2 py-1 rounded cursor-pointer transition-colors ${
                          isExcluded
                            ? "text-gray-400 dark:text-gray-500 line-through opacity-60"
                            : isActive
                              ? "bg-indigo-100 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-300 font-medium"
                              : "text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-800"
                        }`}
                        title={`${f.brand} ${f.line} ${f.name} (${f.color})${f.owned ? " — Owned" : ""} — Right-click to exclude`}
                      >
                        <span
                          className={`w-3 h-3 rounded-full shrink-0 border border-gray-300 dark:border-gray-500 ${isExcluded ? "opacity-40" : ""}`}
                          style={{ backgroundColor: f.color || "#ccc" }}
                        />
                        <span className="truncate">{f.brand} {f.name}</span>
                        {f.owned && (
                          <span className="text-[8px] text-green-600 dark:text-green-400 shrink-0">&#10003;</span>
                        )}
                        <span className="ml-auto text-[10px] text-gray-400 dark:text-gray-500 shrink-0">{f.project_count}</span>
                      </button>
                    </li>
                  );
                })}
              </ul>
              </>
            )}
          </div>
        )}

        {/* Sizes */}
        {sizes.length > 0 && (
          <div>
            <button onClick={() => toggleSection("sizes")} className="flex items-center gap-1 cursor-pointer group mb-2">
              <svg
                className={`w-3 h-3 text-gray-400 dark:text-gray-500 transition-transform ${collapsed.sizes ? "" : "rotate-90"}`}
                fill="none" stroke="currentColor" viewBox="0 0 24 24"
              >
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </svg>
              <h3 className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider group-hover:text-gray-700 dark:group-hover:text-gray-300 transition-colors">
                Sizes
              </h3>
            </button>
            {!collapsed.sizes && (
              <div className="flex flex-wrap gap-1.5">
                {sizes.map((s) => {
                  const isActive = selectedSize === s;
                  const isExcluded = excludedSizes.includes(s);
                  return (
                    <button
                      key={s}
                      onClick={() => toggleSize(s)}
                      onContextMenu={(e) => { e.preventDefault(); excludeSize(s); }}
                      className={`text-xs px-2 py-0.5 rounded-full transition-all cursor-pointer border border-gray-300 dark:border-gray-600 ${
                        isExcluded
                          ? "line-through text-gray-400 dark:text-gray-500 opacity-60"
                          : isActive
                            ? "ring-2 ring-offset-1 ring-indigo-400 bg-indigo-50 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-300"
                            : "text-gray-600 dark:text-gray-400 opacity-70 hover:opacity-100"
                      }`}
                    >
                      {s}
                    </button>
                  );
                })}
              </div>
            )}
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
