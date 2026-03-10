import { useState } from "react";
import { createCollection, updateCollection, deleteCollection } from "../lib/api";
import type { Collection } from "../lib/types";
import Modal from "./Modal";

interface CollectionManagerProps {
  open: boolean;
  onClose: () => void;
  collections: Collection[];
  onRefresh: () => void;
}

export default function CollectionManager({ open, onClose, collections, onRefresh }: CollectionManagerProps) {
  const [newName, setNewName] = useState("");
  const [newDesc, setNewDesc] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [editDesc, setEditDesc] = useState("");

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!newName.trim()) return;
    await createCollection(newName.trim(), newDesc.trim() || undefined);
    setNewName("");
    setNewDesc("");
    onRefresh();
  }

  async function handleSaveEdit() {
    if (!editingId || !editName.trim()) return;
    await updateCollection(editingId, { name: editName.trim(), description: editDesc.trim() });
    setEditingId(null);
    onRefresh();
  }

  async function handleDelete(id: string) {
    await deleteCollection(id);
    onRefresh();
  }

  function startEdit(c: Collection) {
    setEditingId(c.id);
    setEditName(c.name);
    setEditDesc(c.description);
  }

  return (
    <Modal open={open} onClose={onClose} title="Manage Collections">
        {/* Create new collection */}
        <form onSubmit={handleCreate} className="space-y-2 mb-4">
          <input
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            placeholder="Collection name..."
            className="w-full px-3 py-1.5 text-sm bg-gray-50 dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-400 text-gray-900 dark:text-gray-100"
          />
          <div className="flex gap-2">
            <input
              value={newDesc}
              onChange={(e) => setNewDesc(e.target.value)}
              placeholder="Description (optional)..."
              className="flex-1 px-3 py-1.5 text-sm bg-gray-50 dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-400 text-gray-900 dark:text-gray-100"
            />
            <button
              type="submit"
              disabled={!newName.trim()}
              className="px-3 py-1.5 text-sm bg-indigo-500 hover:bg-indigo-600 disabled:opacity-50 text-white rounded-lg cursor-pointer"
            >
              Add
            </button>
          </div>
        </form>

        {/* Existing collections */}
        <div className="space-y-2 max-h-64 overflow-y-auto">
          {collections.length === 0 ? (
            <p className="text-sm text-gray-400 dark:text-gray-500 text-center py-4">No collections yet</p>
          ) : (
            collections.map((c) => (
              <div key={c.id} className="px-3 py-2 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700/50">
                {editingId === c.id ? (
                  <div className="space-y-2">
                    <input
                      autoFocus
                      value={editName}
                      onChange={(e) => setEditName(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") handleSaveEdit();
                        if (e.key === "Escape") setEditingId(null);
                      }}
                      className="w-full px-2 py-1 text-sm bg-gray-50 dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded focus:outline-none focus:ring-2 focus:ring-indigo-400 text-gray-900 dark:text-gray-100"
                    />
                    <input
                      value={editDesc}
                      onChange={(e) => setEditDesc(e.target.value)}
                      placeholder="Description..."
                      className="w-full px-2 py-1 text-sm bg-gray-50 dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded focus:outline-none focus:ring-2 focus:ring-indigo-400 text-gray-900 dark:text-gray-100"
                    />
                    <div className="flex gap-2 justify-end">
                      <button onClick={() => setEditingId(null)} className="text-xs text-gray-400 hover:text-gray-600 cursor-pointer">Cancel</button>
                      <button onClick={handleSaveEdit} className="text-xs text-indigo-500 hover:text-indigo-600 cursor-pointer font-medium">Save</button>
                    </div>
                  </div>
                ) : (
                  <div className="flex items-center gap-2">
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium text-gray-900 dark:text-gray-100">{c.name}</div>
                      {c.description && (
                        <div className="text-xs text-gray-500 dark:text-gray-400 truncate">{c.description}</div>
                      )}
                    </div>
                    <span className="text-xs text-gray-400 shrink-0">{c.project_count} projects</span>
                    <button
                      onClick={() => startEdit(c)}
                      className="p-1 text-gray-400 hover:text-indigo-500 cursor-pointer"
                      title="Edit"
                    >
                      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                      </svg>
                    </button>
                    <button
                      onClick={() => handleDelete(c.id)}
                      className="p-1 text-gray-400 hover:text-red-500 cursor-pointer"
                      title="Delete"
                    >
                      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                      </svg>
                    </button>
                  </div>
                )}
              </div>
            ))
          )}
        </div>
    </Modal>
  );
}
