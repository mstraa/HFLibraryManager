import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { listProjects, createProject, exportData } from "./lib/api";
import type { ProjectSummary, SortBy, SortOrder } from "./lib/types";
import Sidebar from "./components/Sidebar";
import SearchBar from "./components/SearchBar";
import ProjectGrid from "./components/ProjectGrid";
import CreateProjectDialog from "./components/CreateProjectDialog";
import ProjectDetail from "./components/ProjectDetail";
import BulkActions from "./components/BulkActions";
import { useKeyboard } from "./hooks/useKeyboard";
import "./App.css";

function App() {
  const [projects, setProjects] = useState<ProjectSummary[]>([]);
  const [search, setSearch] = useState("");
  const [sortBy, setSortBy] = useState<SortBy>("updated_at");
  const [sortOrder, setSortOrder] = useState<SortOrder>("desc");
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [selectedCollection, setSelectedCollection] = useState<string | undefined>();
  const [selectedAssetTypes, setSelectedAssetTypes] = useState<string[]>([]);
  const [selectedCreator, setSelectedCreator] = useState<string | undefined>();
  const [showCreate, setShowCreate] = useState(false);
  const [activeProjectId, setActiveProjectId] = useState<string | null>(null);
  const [sidebarRefreshKey, setSidebarRefreshKey] = useState(0);
  const [selectedProjectIds, setSelectedProjectIds] = useState<string[]>([]);

  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);

  const loadProjects = useCallback(async () => {
    const result = await listProjects({
      search: search || undefined,
      tag_ids: selectedTags.length > 0 ? selectedTags : undefined,
      collection_id: selectedCollection,
      asset_types: selectedAssetTypes.length > 0 ? selectedAssetTypes : undefined,
      creator: selectedCreator,
      sort_by: sortBy,
      sort_order: sortOrder,
    });
    setProjects(result);
  }, [search, selectedTags, selectedCollection, selectedAssetTypes, selectedCreator, sortBy, sortOrder]);

  // Reload when filters change (debounce search)
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(loadProjects, search ? 200 : 0);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [loadProjects, search]);

  async function handleCreate(name: string, description: string) {
    const project = await createProject(name, description || undefined);
    setShowCreate(false);
    setActiveProjectId(project.id);
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

  // Project detail view
  if (activeProjectId) {
    return (
      <ProjectDetail
        projectId={activeProjectId}
        onBack={handleBack}
        onDeleted={handleBack}
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
        selectedAssetTypes={selectedAssetTypes}
        onAssetTypesChange={setSelectedAssetTypes}
        selectedCreator={selectedCreator}
        onCreatorChange={setSelectedCreator}
        onCreateProject={() => setShowCreate(true)}
        refreshKey={sidebarRefreshKey}
      />

      <div className="flex-1 flex flex-col min-w-0">
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
        />
      </div>

      <CreateProjectDialog
        open={showCreate}
        onClose={() => setShowCreate(false)}
        onCreate={handleCreate}
      />
    </div>
  );
}

export default App;
