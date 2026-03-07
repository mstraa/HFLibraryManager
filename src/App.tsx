import { useCallback, useEffect, useRef, useState } from "react";
import { listProjects, createProject } from "./lib/api";
import type { ProjectSummary, SortBy, SortOrder } from "./lib/types";
import Sidebar from "./components/Sidebar";
import SearchBar from "./components/SearchBar";
import ProjectGrid from "./components/ProjectGrid";
import CreateProjectDialog from "./components/CreateProjectDialog";
import "./App.css";

function App() {
  const [projects, setProjects] = useState<ProjectSummary[]>([]);
  const [search, setSearch] = useState("");
  const [sortBy, setSortBy] = useState<SortBy>("updated_at");
  const [sortOrder, setSortOrder] = useState<SortOrder>("desc");
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [selectedCollection, setSelectedCollection] = useState<string | undefined>();
  const [selectedAssetTypes, setSelectedAssetTypes] = useState<string[]>([]);
  const [showCreate, setShowCreate] = useState(false);

  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const loadProjects = useCallback(async () => {
    const result = await listProjects({
      search: search || undefined,
      tag_ids: selectedTags.length > 0 ? selectedTags : undefined,
      collection_id: selectedCollection,
      asset_types: selectedAssetTypes.length > 0 ? selectedAssetTypes : undefined,
      sort_by: sortBy,
      sort_order: sortOrder,
    });
    setProjects(result);
  }, [search, selectedTags, selectedCollection, selectedAssetTypes, sortBy, sortOrder]);

  // Reload when filters change (debounce search)
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(loadProjects, search ? 200 : 0);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [loadProjects, search]);

  async function handleCreate(name: string, description: string) {
    await createProject(name, description || undefined);
    setShowCreate(false);
    await loadProjects();
  }

  function handleProjectClick(id: string) {
    // Phase 3 will add navigation to project detail
    console.log("Open project:", id);
  }

  return (
    <div className="h-screen flex bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100">
      <Sidebar
        selectedTags={selectedTags}
        onTagsChange={setSelectedTags}
        selectedCollection={selectedCollection}
        onCollectionChange={setSelectedCollection}
        selectedAssetTypes={selectedAssetTypes}
        onAssetTypesChange={setSelectedAssetTypes}
        onCreateProject={() => setShowCreate(true)}
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
        />

        <ProjectGrid
          projects={projects}
          onProjectClick={handleProjectClick}
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
