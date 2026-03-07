import { useEffect, useState } from "react";
import {
  deleteProject,
  setProjectTags,
  addProjectToCollection,
  listTags,
  listCollections,
  getProject,
} from "../lib/api";
import type { TagWithCount, Collection } from "../lib/types";

interface BulkActionsProps {
  selectedIds: string[];
  onClear: () => void;
  onRefresh: () => void;
}

export default function BulkActions({ selectedIds, onClear, onRefresh }: BulkActionsProps) {
  const [tags, setTags] = useState<TagWithCount[]>([]);
  const [collections, setCollections] = useState<Collection[]>([]);
  const [showTagMenu, setShowTagMenu] = useState(false);
  const [showCollectionMenu, setShowCollectionMenu] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  useEffect(() => {
    Promise.all([listTags(), listCollections()]).then(([t, c]) => {
      setTags(t);
      setCollections(c);
    });
  }, []);

  async function handleBulkAddTag(tagId: string) {
    for (const projectId of selectedIds) {
      // We can't easily get existing tags here, so we use a workaround:
      // the backend set_project_tags replaces all tags, but for bulk we want additive
      // Instead we'll just call the add individually — acceptable for bulk
      await addTagToProject(projectId, tagId);
    }
    setShowTagMenu(false);
    onRefresh();
  }

  async function addTagToProject(projectId: string, tagId: string) {
    // Get current tags, add new one if not present
    const project = await getProject(projectId);
    const currentIds = project.tags.map((t) => t.id);
    if (!currentIds.includes(tagId)) {
      await setProjectTags(projectId, [...currentIds, tagId]);
    }
  }

  async function handleBulkAddToCollection(collectionId: string) {
    for (const projectId of selectedIds) {
      await addProjectToCollection(projectId, collectionId);
    }
    setShowCollectionMenu(false);
    onRefresh();
  }

  async function handleBulkDelete() {
    for (const projectId of selectedIds) {
      await deleteProject(projectId);
    }
    setShowDeleteConfirm(false);
    onClear();
    onRefresh();
  }

  if (selectedIds.length === 0) return null;

  return (
    <>
      <div className="flex items-center gap-2 px-4 py-2 bg-indigo-50 dark:bg-indigo-900/30 border-b border-indigo-200 dark:border-indigo-800">
        <span className="text-sm font-medium text-indigo-700 dark:text-indigo-300">
          {selectedIds.length} selected
        </span>

        <div className="flex-1" />

        {/* Tag menu */}
        <div className="relative">
          <button
            onClick={() => { setShowTagMenu(!showTagMenu); setShowCollectionMenu(false); }}
            className="text-xs px-3 py-1.5 rounded-lg bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-600 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 cursor-pointer"
          >
            + Tag
          </button>
          {showTagMenu && (
            <div className="absolute top-full mt-1 left-0 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg shadow-lg py-1 z-10 min-w-[140px]">
              {tags.length === 0 ? (
                <div className="px-3 py-2 text-xs text-gray-400">No tags</div>
              ) : (
                tags.map((t) => (
                  <button
                    key={t.id}
                    onClick={() => handleBulkAddTag(t.id)}
                    className="w-full text-left px-3 py-1.5 text-sm flex items-center gap-2 hover:bg-gray-100 dark:hover:bg-gray-700 cursor-pointer"
                  >
                    <span className="w-3 h-3 rounded-full shrink-0" style={{ backgroundColor: t.color }} />
                    <span className="text-gray-700 dark:text-gray-300">{t.name}</span>
                  </button>
                ))
              )}
            </div>
          )}
        </div>

        {/* Collection menu */}
        <div className="relative">
          <button
            onClick={() => { setShowCollectionMenu(!showCollectionMenu); setShowTagMenu(false); }}
            className="text-xs px-3 py-1.5 rounded-lg bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-600 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 cursor-pointer"
          >
            + Collection
          </button>
          {showCollectionMenu && (
            <div className="absolute top-full mt-1 left-0 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg shadow-lg py-1 z-10 min-w-[140px]">
              {collections.length === 0 ? (
                <div className="px-3 py-2 text-xs text-gray-400">No collections</div>
              ) : (
                collections.map((c) => (
                  <button
                    key={c.id}
                    onClick={() => handleBulkAddToCollection(c.id)}
                    className="w-full text-left px-3 py-1.5 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 cursor-pointer"
                  >
                    {c.name}
                  </button>
                ))
              )}
            </div>
          )}
        </div>

        {/* Delete */}
        <button
          onClick={() => setShowDeleteConfirm(true)}
          className="text-xs px-3 py-1.5 rounded-lg bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-800 text-red-600 dark:text-red-400 hover:bg-red-100 dark:hover:bg-red-900/50 cursor-pointer"
        >
          Delete
        </button>

        <button
          onClick={onClear}
          className="text-xs text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 cursor-pointer ml-1"
        >
          Cancel
        </button>
      </div>

      {/* Delete confirm */}
      {showDeleteConfirm && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
          <div className="bg-white dark:bg-gray-800 rounded-xl shadow-2xl w-full max-w-sm mx-4 p-6">
            <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-2">Delete Projects</h2>
            <p className="text-sm text-gray-600 dark:text-gray-400 mb-6">
              Delete {selectedIds.length} project{selectedIds.length !== 1 ? "s" : ""}? This will remove all associated files and cannot be undone.
            </p>
            <div className="flex justify-end gap-2">
              <button
                onClick={() => setShowDeleteConfirm(false)}
                className="px-4 py-2 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors cursor-pointer"
              >
                Cancel
              </button>
              <button
                onClick={handleBulkDelete}
                className="px-4 py-2 text-sm bg-red-500 hover:bg-red-600 text-white rounded-lg transition-colors cursor-pointer"
              >
                Delete All
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
