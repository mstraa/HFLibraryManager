import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { listProjects, createProject, importFiles, listFolderFiles, toggleFileFavorite, exportData } from "./lib/api";
import type { ProjectSummary, SortBy, SortOrder } from "./lib/types";
import Sidebar from "./components/Sidebar";
import SearchBar from "./components/SearchBar";
import ProjectGrid from "./components/ProjectGrid";
import CreateProjectDialog from "./components/CreateProjectDialog";
import ProjectDetail from "./components/ProjectDetail";
import BulkActions from "./components/BulkActions";
import { useKeyboard } from "./hooks/useKeyboard";
import { useFileDrop } from "./hooks/useFileDrop";
import "./App.css";

function App() {
  const [projects, setProjects] = useState<ProjectSummary[]>([]);
  const [search, setSearch] = useState("");
  const [sortBy, setSortBy] = useState<SortBy>("updated_at");
  const [sortOrder, setSortOrder] = useState<SortOrder>("desc");
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [selectedCollection, setSelectedCollection] = useState<string | undefined>();
  const [selectedCreator, setSelectedCreator] = useState<string | undefined>();
  const [selectedFilaments, setSelectedFilaments] = useState<string[]>([]);
  const [selectedSize, setSelectedSize] = useState<string | undefined>();
  const [showCreate, setShowCreate] = useState(false);
  const [activeProjectId, setActiveProjectId] = useState<string | null>(null);
  const [sidebarRefreshKey, setSidebarRefreshKey] = useState(0);
  const [selectedProjectIds, setSelectedProjectIds] = useState<string[]>([]);
  const [importing, setImporting] = useState(false);

  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);

  const loadProjects = useCallback(async () => {
    const result = await listProjects({
      search: search || undefined,
      tag_ids: selectedTags.length > 0 ? selectedTags : undefined,
      collection_id: selectedCollection,
      creator: selectedCreator,
      filaments: selectedFilaments.length > 0 ? selectedFilaments : undefined,
      size: selectedSize,
      sort_by: sortBy,
      sort_order: sortOrder,
    });
    setProjects(result);
  }, [search, selectedTags, selectedCollection, selectedCreator, selectedFilaments, selectedSize, sortBy, sortOrder]);

  // Reload when filters change (debounce search)
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(loadProjects, search ? 200 : 0);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [loadProjects, search]);

  async function handleCreate(name: string, description: string, importFolder?: string) {
    setImporting(!!importFolder);
    try {
      const project = await createProject(name, description || undefined);
      if (importFolder) {
        const filePaths = await listFolderFiles(importFolder);
        if (filePaths.length > 0) {
          const imported = await importFiles(project.id, filePaths);

          // Auto-star the most recent file of each category
          const DESIGN_EXTS = new Set(["png", "jpg", "jpeg", "webp", "gif", "bmp", "tiff", "svg", "af", "afdesign", "afphoto", "afpub", "psd", "ai", "xcf", "kra"]);
          const newest: Record<string, { id: string; time: string }> = {};

          for (const f of imported) {
            const ext = f.original_filename.split(".").pop()?.toLowerCase() ?? "";
            let category: string | null = null;
            if (ext === "hfp") category = "hfp";
            else if (ext === "stl") category = "stl";
            else if (ext === "txt") category = "txt";
            else if (DESIGN_EXTS.has(ext)) category = "design";

            if (category && (!newest[category] || f.created_at > newest[category].time)) {
              newest[category] = { id: f.id, time: f.created_at };
            }
          }

          const toStar = Object.values(newest).map((v) => v.id);
          await Promise.all(toStar.map((id) => toggleFileFavorite(id)));

          // Set most recent image as project thumbnail
          if (newest["design"]) {
            const designFile = imported.find((f) => f.id === newest["design"].id);
            if (designFile) {
              const { setProjectThumbnail } = await import("./lib/api");
              await setProjectThumbnail(project.id, designFile.file_path);
            }
          }
        }
      }
      setShowCreate(false);
      setActiveProjectId(project.id);
    } finally {
      setImporting(false);
    }
  }

  function handleBack() {
    setActiveProjectId(null);
    setSidebarRefreshKey((k) => k + 1);
    loadProjects();
  }

  function handleToggleSelect(id: string) {
    setSelectedProjectIds((prev) =>
      prev.includes(id) ? prev.filter((pid) => pid !== id) : [...prev, id]
    );
  }

  async function handleExport() {
    const data = await exportData();
    const blob = new Blob([data], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `3d-print-manager-backup-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  // Keyboard shortcuts
  const keyBindings = useMemo(() => [
    { key: "n", meta: true, handler: () => setShowCreate(true) },
    { key: "f", meta: true, handler: () => searchInputRef.current?.focus() },
    { key: "e", meta: true, shift: true, handler: handleExport },
    { key: "Escape", handler: () => {
      if (selectedProjectIds.length > 0) {
        setSelectedProjectIds([]);
      } else if (showCreate) {
        setShowCreate(false);
      }
    }},
    { key: "a", meta: true, handler: () => {
      if (projects.length > 0) {
        setSelectedProjectIds(projects.map((p) => p.id));
      }
    }},
  ], [projects, selectedProjectIds.length, showCreate]);

  useKeyboard(keyBindings);

  // Handle folder drop to create project
  const handleFolderDrop = useCallback(async (paths: string[]) => {
    if (activeProjectId) return; // Only on library view
    // Take the first path — expect it to be a folder
    const folderPath = paths[0];
    const folderName = folderPath.split("/").pop() || "Untitled";
    await handleCreate(folderName, "", folderPath);
  }, [activeProjectId]);

  const { isDragging } = useFileDrop(handleFolderDrop);

  // Project detail view
  if (activeProjectId) {
    return (
      <ProjectDetail
        projectId={activeProjectId}
        onBack={handleBack}
        onDeleted={handleBack}
        onFilterByFilaments={(hexColors) => {
          setSelectedFilaments(hexColors);
          setActiveProjectId(null);
          setSidebarRefreshKey((k) => k + 1);
        }}
      />
    );
  }

  // Library view
  return (
    <div className="h-screen flex bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100">
      <Sidebar
        selectedTags={selectedTags}
        onTagsChange={setSelectedTags}
        selectedCollection={selectedCollection}
        onCollectionChange={setSelectedCollection}
        selectedCreator={selectedCreator}
        onCreatorChange={setSelectedCreator}
        selectedFilaments={selectedFilaments}
        onFilamentsChange={setSelectedFilaments}
        selectedSize={selectedSize}
        onSizeChange={setSelectedSize}
        onCreateProject={() => setShowCreate(true)}
        refreshKey={sidebarRefreshKey}
        hasSearch={search.length > 0}
        onClearAll={() => {
          setSearch("");
          setSelectedTags([]);
          setSelectedCollection(undefined);
          setSelectedCreator(undefined);
          setSelectedFilaments([]);
          setSelectedSize(undefined);
        }}
      />

      <div className="flex-1 flex flex-col min-w-0 relative">
        <SearchBar
          search={search}
          onSearchChange={setSearch}
          sortBy={sortBy}
          onSortByChange={setSortBy}
          sortOrder={sortOrder}
          onSortOrderChange={setSortOrder}
          projectCount={projects.length}
          inputRef={searchInputRef}
          onExport={handleExport}
        />

        <BulkActions
          selectedIds={selectedProjectIds}
          onClear={() => setSelectedProjectIds([])}
          onRefresh={() => {
            loadProjects();
            setSidebarRefreshKey((k) => k + 1);
          }}
        />

        <ProjectGrid
          projects={projects}
          onProjectClick={setActiveProjectId}
          selectedIds={selectedProjectIds}
          onToggleSelect={handleToggleSelect}
          onFilamentClick={(hex) => setSelectedFilaments((prev) =>
            prev.includes(hex) ? prev : [...prev, hex]
          )}
          onSizeClick={(size) => setSelectedSize(size)}
        />

        {/* Drop overlay */}
        {isDragging && !activeProjectId && (
          <div className="absolute inset-0 bg-indigo-500/10 border-2 border-dashed border-indigo-400 rounded-lg flex items-center justify-center z-40 pointer-events-none">
            <div className="bg-white dark:bg-gray-800 rounded-xl shadow-xl px-8 py-6 text-center">
              <svg className="w-12 h-12 mx-auto text-indigo-500 mb-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
              </svg>
              <p className="text-lg font-semibold text-indigo-600 dark:text-indigo-400">Drop folder to create project</p>
              <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">Files will be imported automatically</p>
            </div>
          </div>
        )}

        {/* Import loading overlay */}
        {importing && (
          <div className="absolute inset-0 bg-white/80 dark:bg-gray-900/80 flex items-center justify-center z-50">
            <div className="text-center">
              <svg className="w-10 h-10 mx-auto text-indigo-500 animate-spin mb-3" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
              </svg>
              <p className="text-sm font-medium text-gray-700 dark:text-gray-300">Importing files...</p>
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">Setting up project</p>
            </div>
          </div>
        )}
      </div>

      <CreateProjectDialog
        open={showCreate}
        onClose={() => setShowCreate(false)}
        onCreate={handleCreate}
        loading={importing}
      />
    </div>
  );
}

export default App;
