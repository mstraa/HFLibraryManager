import { useEffect, useState } from "react";
import { open } from "@tauri-apps/plugin-dialog";
import { convertFileSrc } from "@tauri-apps/api/core";
import { listProjects } from "../lib/api";
import type { ProjectSummary } from "../lib/types";
import Modal from "./Modal";

interface CreateProjectDialogProps {
  open: boolean;
  onClose: () => void;
  onCreate: (name: string, description: string, importFolder?: string) => void;
  onCreateFromTemplate?: (templateId: string, name: string, description: string) => void;
  onImportProject?: () => void;
  loading?: boolean;
}

export default function CreateProjectDialog({
  open: isOpen,
  onClose,
  onCreate,
  onCreateFromTemplate,
  onImportProject,
  loading,
}: CreateProjectDialogProps) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [importFolder, setImportFolder] = useState<string | undefined>();
  const [templates, setTemplates] = useState<ProjectSummary[]>([]);
  const [selectedTemplate, setSelectedTemplate] = useState<string | null>(null);

  // Reset fields and load templates when dialog opens
  useEffect(() => {
    if (isOpen) {
      setName("");
      setDescription("");
      setImportFolder(undefined);
      setSelectedTemplate(null);
      listProjects({ is_template: true, sort_by: "name", sort_order: "asc" }).then(setTemplates).catch(() => setTemplates([]));
    }
  }, [isOpen]);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim() || loading) return;
    if (selectedTemplate && onCreateFromTemplate) {
      onCreateFromTemplate(selectedTemplate, name.trim(), description.trim());
    } else {
      onCreate(name.trim(), description.trim(), importFolder);
    }
  }

  function handleSelectTemplate(id: string | null) {
    setSelectedTemplate(id);
    if (id) {
      const tpl = templates.find((t) => t.id === id);
      if (tpl && !name.trim()) {
        setName(tpl.name);
      }
      setImportFolder(undefined);
    }
  }

  async function handleSelectFolder() {
    const selected = await open({ directory: true, multiple: false });
    if (!selected) return;
    const path = typeof selected === "string" ? selected : (selected as { path: string }).path;
    if (path) {
      setImportFolder(path);
      setSelectedTemplate(null);
      // Auto-fill name from folder name if empty
      if (!name.trim()) {
        const folderName = path.split(/[/\\]/).pop() || "";
        if (folderName) setName(folderName);
      }
    }
  }

  return (
    <Modal open={isOpen} onClose={onClose} title="New Project" preventClose={loading}>
        <form onSubmit={handleSubmit} className="space-y-4">

          {/* Template picker */}
          {templates.length > 0 && (
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                Start from template (optional)
              </label>
              <div className="flex gap-2 overflow-x-auto pb-1">
                {/* Blank option */}
                <button
                  type="button"
                  onClick={() => handleSelectTemplate(null)}
                  className={`shrink-0 w-24 rounded-lg border-2 transition-all cursor-pointer ${
                    selectedTemplate === null
                      ? "border-indigo-400 dark:border-indigo-500 ring-1 ring-indigo-300 dark:ring-indigo-600"
                      : "border-gray-200 dark:border-gray-600 hover:border-gray-300 dark:hover:border-gray-500"
                  }`}
                >
                  <div className="aspect-[4/3] bg-gray-50 dark:bg-gray-700 rounded-t-md flex items-center justify-center">
                    <svg className="w-6 h-6 text-gray-300 dark:text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
                    </svg>
                  </div>
                  <div className="px-1.5 py-1">
                    <span className="text-[10px] text-gray-500 dark:text-gray-400 block truncate">Blank</span>
                  </div>
                </button>

                {/* Template options */}
                {templates.map((tpl) => (
                  <button
                    key={tpl.id}
                    type="button"
                    onClick={() => handleSelectTemplate(tpl.id)}
                    className={`shrink-0 w-24 rounded-lg border-2 transition-all cursor-pointer ${
                      selectedTemplate === tpl.id
                        ? "border-indigo-400 dark:border-indigo-500 ring-1 ring-indigo-300 dark:ring-indigo-600"
                        : "border-gray-200 dark:border-gray-600 hover:border-gray-300 dark:hover:border-gray-500"
                    }`}
                  >
                    <div className="aspect-[4/3] bg-gray-100 dark:bg-gray-700 rounded-t-md overflow-hidden flex items-center justify-center">
                      {tpl.thumbnail_path ? (
                        <img
                          src={convertFileSrc(tpl.thumbnail_path) + "?v=" + encodeURIComponent(tpl.updated_at)}
                          alt={tpl.name}
                          className="w-full h-full object-cover"
                        />
                      ) : (
                        <svg className="w-6 h-6 text-gray-300 dark:text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 5a1 1 0 011-1h14a1 1 0 011 1v2a1 1 0 01-1 1H5a1 1 0 01-1-1V5zM4 13a1 1 0 011-1h6a1 1 0 011 1v6a1 1 0 01-1 1H5a1 1 0 01-1-1v-6z" />
                        </svg>
                      )}
                    </div>
                    <div className="px-1.5 py-1">
                      <span className="text-[10px] text-gray-700 dark:text-gray-300 block truncate">{tpl.name}</span>
                    </div>
                  </button>
                ))}
              </div>
            </div>
          )}

          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Name
            </label>
            <input
              autoFocus
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="My awesome design..."
              className="w-full px-3 py-2 text-sm bg-gray-50 dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-400 text-gray-900 dark:text-gray-100"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Description (optional)
            </label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Describe your project..."
              rows={3}
              className="w-full px-3 py-2 text-sm bg-gray-50 dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-400 text-gray-900 dark:text-gray-100 resize-none"
            />
          </div>

          {/* Import from folder — hidden when template selected */}
          {!selectedTemplate && (
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Import files from folder (optional)
              </label>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={handleSelectFolder}
                  className="px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors cursor-pointer shrink-0"
                >
                  Select folder...
                </button>
                {importFolder ? (
                  <div className="flex items-center gap-1.5 min-w-0 flex-1">
                    <span className="text-xs text-gray-500 dark:text-gray-400 truncate">
                      {importFolder.replace(/^(\/Users\/[^/]+|C:\\Users\\[^\\]+)/, "~")}
                    </span>
                    <button
                      type="button"
                      onClick={() => setImportFolder(undefined)}
                      className="p-0.5 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 cursor-pointer shrink-0"
                    >
                      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    </button>
                  </div>
                ) : (
                  <span className="text-xs text-gray-400 dark:text-gray-500">
                    No folder selected
                  </span>
                )}
              </div>
            </div>
          )}

          <div className="flex justify-between items-center pt-2">
            {onImportProject ? (
              <button
                type="button"
                onClick={() => { onClose(); onImportProject(); }}
                disabled={loading}
                className="flex items-center gap-1.5 px-3 py-2 text-sm text-indigo-600 dark:text-indigo-400 hover:bg-indigo-50 dark:hover:bg-indigo-900/30 rounded-lg transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
                </svg>
                Import .hllmproject
              </button>
            ) : (
              <div />
            )}
            <div className="flex gap-2">
              <button
                type="button"
                onClick={onClose}
                disabled={loading}
                className="px-4 py-2 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={!name.trim() || loading}
                className="px-4 py-2 text-sm bg-indigo-500 hover:bg-indigo-600 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-lg transition-colors cursor-pointer flex items-center gap-2"
              >
                {loading && (
                  <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                  </svg>
                )}
                {loading ? "Creating..." : selectedTemplate ? "Create from template" : "Create"}
              </button>
            </div>
          </div>
        </form>
    </Modal>
  );
}
