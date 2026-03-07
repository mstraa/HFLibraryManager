import { useEffect, useState } from "react";
import { listTags, listCollections } from "../lib/api";
import type { TagWithCount, Collection, AssetType } from "../lib/types";

const ASSET_TYPES: { value: AssetType; label: string }[] = [
  { value: "affinity", label: "Affinity" },
  { value: "hueforge", label: "HueForge" },
  { value: "bambulab", label: "BambuLab" },
];

interface SidebarProps {
  selectedTags: string[];
  onTagsChange: (tags: string[]) => void;
  selectedCollection: string | undefined;
  onCollectionChange: (id: string | undefined) => void;
  selectedAssetTypes: string[];
  onAssetTypesChange: (types: string[]) => void;
  onCreateProject: () => void;
}

export default function Sidebar({
  selectedTags,
  onTagsChange,
  selectedCollection,
  onCollectionChange,
  selectedAssetTypes,
  onAssetTypesChange,
  onCreateProject,
}: SidebarProps) {
  const [tags, setTags] = useState<TagWithCount[]>([]);
  const [collections, setCollections] = useState<Collection[]>([]);

  useEffect(() => {
    loadFilters();
  }, []);

  async function loadFilters() {
    const [t, c] = await Promise.all([listTags(), listCollections()]);
    setTags(t);
    setCollections(c);
  }

  function toggleTag(id: string) {
    if (selectedTags.includes(id)) {
      onTagsChange(selectedTags.filter((t) => t !== id));
    } else {
      onTagsChange([...selectedTags, id]);
    }
  }

  function toggleAssetType(type: string) {
    if (selectedAssetTypes.includes(type)) {
      onAssetTypesChange(selectedAssetTypes.filter((t) => t !== type));
    } else {
      onAssetTypesChange([...selectedAssetTypes, type]);
    }
  }

  function clearAll() {
    onTagsChange([]);
    onCollectionChange(undefined);
    onAssetTypesChange([]);
  }

  const hasFilters =
    selectedTags.length > 0 ||
    selectedCollection !== undefined ||
    selectedAssetTypes.length > 0;

  return (
    <aside className="w-56 shrink-0 border-r border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900 p-4 flex flex-col gap-5 overflow-y-auto">
      <button
        onClick={onCreateProject}
        className="w-full py-2 px-4 bg-indigo-500 hover:bg-indigo-600 text-white rounded-lg text-sm font-medium transition-colors cursor-pointer"
      >
        + New Project
      </button>

      {/* Collections */}
      <div>
        <h3 className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-2">
          Collections
        </h3>
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
        <h3 className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-2">
          Tags
        </h3>
        {tags.length === 0 ? (
          <p className="text-xs text-gray-400 dark:text-gray-500">No tags yet</p>
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

      {/* Asset Types */}
      <div>
        <h3 className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-2">
          File Types
        </h3>
        <div className="space-y-1">
          {ASSET_TYPES.map((at) => (
            <label
              key={at.value}
              className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300 cursor-pointer"
            >
              <input
                type="checkbox"
                checked={selectedAssetTypes.includes(at.value)}
                onChange={() => toggleAssetType(at.value)}
                className="rounded border-gray-300 text-indigo-500 focus:ring-indigo-400"
              />
              {at.label}
            </label>
          ))}
        </div>
      </div>

      {/* Clear filters */}
      {hasFilters && (
        <button
          onClick={clearAll}
          className="text-xs text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 underline cursor-pointer"
        >
          Clear all filters
        </button>
      )}
    </aside>
  );
}
