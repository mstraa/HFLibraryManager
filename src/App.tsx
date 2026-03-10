import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { listProjects, createProject, importFiles, listFolderFiles, toggleFileFavorite, setProjectThumbnail, setProjectTags, addProjectToCollection, isFirstLaunch } from "./lib/api";
import type { ProjectSummary, SortBy, SortOrder, ViewMode } from "./lib/types";
import Sidebar from "./components/Sidebar";
import SearchBar from "./components/SearchBar";
import ProjectGrid from "./components/ProjectGrid";
import ProjectTable from "./components/ProjectTable";
import CreateProjectDialog from "./components/CreateProjectDialog";
import ProjectDetail from "./components/ProjectDetail";
import BulkActions from "./components/BulkActions";
import Settings from "./components/Settings";
import FilamentManager from "./components/FilamentManager";
import Welcome from "./components/Welcome";
import { useKeyboard } from "./hooks/useKeyboard";
import { useFileDrop } from "./hooks/useFileDrop";
import { useSwipeNavigation } from "./hooks/useSwipeNavigation";
import "./App.css";

function App() {
  const [showWelcome, setShowWelcome] = useState<boolean | null>(null); // null = loading
  const [projects, setProjects] = useState<ProjectSummary[]>([]);
  const [search, setSearch] = useState("");
  const [sortBy, setSortBy] = useState<SortBy>("created_at");
  const [sortOrder, setSortOrder] = useState<SortOrder>("desc");
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [excludedTags, setExcludedTags] = useState<string[]>([]);
  const [selectedCollection, setSelectedCollection] = useState<string | undefined>();
  const [selectedFilaments, setSelectedFilaments] = useState<string[]>([]);
  const [excludedFilaments, setExcludedFilaments] = useState<string[]>([]);
  const [selectedSize, setSelectedSize] = useState<string | undefined>();
  const [excludedSizes, setExcludedSizes] = useState<string[]>([]);
  const [noFilamentFilter, _setNoFilamentFilter] = useState<"include" | "exclude" | undefined>(() => {
    const stored = localStorage.getItem("no-filament-filter");
    if (stored === "include" || stored === "exclude") return stored;
    return undefined;
  });
  const setNoFilamentFilter = useCallback((v: "include" | "exclude" | undefined) => {
    _setNoFilamentFilter(v);
    localStorage.setItem("no-filament-filter", v ?? "off");
  }, []);
  const [ownedOnly, setOwnedOnly] = useState(false);
  const [allOwned, setAllOwned] = useState(false);
  const [showCreate, setShowCreate] = useState(false);
  const [activeProjectId, setActiveProjectId] = useState<string | null>(null);
  const navHistoryRef = useRef<string[]>([]); // stack of previous project IDs
  const navForwardRef = useRef<string[]>([]); // stack of forward project IDs
  const [sidebarRefreshKey, setSidebarRefreshKey] = useState(0);
  const [selectedProjectIds, setSelectedProjectIds] = useState<string[]>([]);
  const [importing, setImporting] = useState(false);
  const selectedTagsRef = useRef(selectedTags);
  selectedTagsRef.current = selectedTags;
  const selectedCollectionRef = useRef(selectedCollection);
  selectedCollectionRef.current = selectedCollection;
  const [showSettings, setShowSettings] = useState(false);
  const [showFilamentManager, setShowFilamentManager] = useState(false);
  const [viewMode, setViewMode] = useState<ViewMode>("grid");

  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);

  const loadProjects = useCallback(async () => {
    const result = await listProjects({
      search: search || undefined,
      tag_ids: selectedTags.length > 0 ? selectedTags : undefined,
      collection_id: selectedCollection,
      filament_ids: selectedFilaments.length > 0 ? selectedFilaments : undefined,
      size: selectedSize,
      exclude_tag_ids: excludedTags.length > 0 ? excludedTags : undefined,
      exclude_filament_ids: excludedFilaments.length > 0 ? excludedFilaments : undefined,
      exclude_sizes: excludedSizes.length > 0 ? excludedSizes : undefined,
      no_filament: noFilamentFilter,
      owned_only: ownedOnly || undefined,
      all_owned: (ownedOnly && allOwned) || undefined,
      sort_by: sortBy,
      sort_order: sortOrder,
    });
    setProjects(result);
  }, [search, selectedTags, excludedTags, selectedCollection, selectedFilaments, excludedFilaments, selectedSize, excludedSizes, noFilamentFilter, ownedOnly, allOwned, sortBy, sortOrder]);

  // Check first launch
  useEffect(() => {
    isFirstLaunch().then(setShowWelcome).catch(() => setShowWelcome(false));
  }, []);

  // Reload when filters change (debounce search)
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(loadProjects, search ? 200 : 0);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [loadProjects, search]);

  async function handleCreate(name: string, description: string, importFolder?: string, navigateToProject = true) {
    setImporting(!!importFolder);
    try {
      const project = await createProject(name, description || undefined);

      // Append currently selected filter tags/collection to the new project
      if (selectedTagsRef.current.length > 0) {
        await setProjectTags(project.id, selectedTagsRef.current);
      }
      if (selectedCollectionRef.current) {
        await addProjectToCollection(project.id, selectedCollectionRef.current);
      }

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
            else if (ext === "3mf") category = "3mf";
            else if (ext === "stl") category = "stl";
            else if (ext === "txt") category = "txt";
            else if (DESIGN_EXTS.has(ext)) category = "design";

            if (category && (!newest[category] || f.modified_at > newest[category].time)) {
              newest[category] = { id: f.id, time: f.modified_at };
            }
          }

          const toStar = Object.values(newest).map((v) => v.id);
          await Promise.all(toStar.map((id) => toggleFileFavorite(id)));

          // Set most recent image as project thumbnail
          if (newest["design"]) {
            const designFile = imported.find((f) => f.id === newest["design"].id);
            if (designFile) {
              await setProjectThumbnail(project.id, designFile.file_path);
            }
          }
        }
      }
      setShowCreate(false);
      if (navigateToProject) {
        navigateTo(project.id);
      } else {
        loadProjects();
        setSidebarRefreshKey((k) => k + 1);
      }
    } finally {
      setImporting(false);
    }
  }

  function navigateTo(projectId: string | null) {
    // Push current state onto history before navigating
    navHistoryRef.current.push(activeProjectId ?? "__library__");
    navForwardRef.current = []; // clear forward on new navigation
    setActiveProjectId(projectId);
    if (!projectId) {
      setSidebarRefreshKey((k) => k + 1);
      loadProjects();
    }
  }

  function navigateBack() {
    if (navHistoryRef.current.length === 0) {
      // No history but in a project/settings — go to library
      if (activeProjectId || showSettings) {
        if (showSettings) { setShowSettings(false); return; }
        navForwardRef.current.push(activeProjectId ?? "__library__");
        setActiveProjectId(null);
        setSidebarRefreshKey((k) => k + 1);
        loadProjects();
      }
      return;
    }
    const prev = navHistoryRef.current.pop()!;
    navForwardRef.current.push(activeProjectId ?? "__library__");
    const id = prev === "__library__" ? null : prev;
    setActiveProjectId(id);
    if (!id) {
      setSidebarRefreshKey((k) => k + 1);
      loadProjects();
    }
  }

  function navigateForward() {
    if (navForwardRef.current.length === 0) return;
    const next = navForwardRef.current.pop()!;
    navHistoryRef.current.push(activeProjectId ?? "__library__");
    const id = next === "__library__" ? null : next;
    setActiveProjectId(id);
    if (!id) {
      setSidebarRefreshKey((k) => k + 1);
      loadProjects();
    }
  }

  // Mouse back/forward buttons (3=back, 4=forward)
  useEffect(() => {
    function onMouseDown(e: MouseEvent) {
      if (e.button === 3) { e.preventDefault(); navigateBack(); }
      if (e.button === 4) { e.preventDefault(); navigateForward(); }
    }
    window.addEventListener("mousedown", onMouseDown);
    return () => window.removeEventListener("mousedown", onMouseDown);
  }); // intentionally no deps — reads mutable refs

  function handleBack() {
    navigateTo(null);
  }

  function handleToggleSelect(id: string) {
    setSelectedProjectIds((prev) =>
      prev.includes(id) ? prev.filter((pid) => pid !== id) : [...prev, id]
    );
  }

  // Keyboard shortcuts
  const keyBindings = useMemo(() => [
    { key: "n", meta: true, handler: () => setShowCreate(true) },
    { key: "f", meta: true, handler: () => searchInputRef.current?.focus() },
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
  useSwipeNavigation(navigateBack, navigateForward);

  // Handle folder drop to create project(s)
  const handleFolderDrop = useCallback(async (paths: string[]) => {
    if (activeProjectId) return; // Only on library view
    for (const folderPath of paths) {
      const folderName = folderPath.split("/").pop() || "Untitled";
      await handleCreate(folderName, "", folderPath, false);
    }
  }, [activeProjectId]);

  const { isDragging } = useFileDrop(handleFolderDrop);

  // First launch — show welcome screen
  if (showWelcome === null) {
    return <div className="h-screen bg-gray-900" />; // loading
  }
  if (showWelcome) {
    return <Welcome onComplete={() => setShowWelcome(false)} />;
  }

  // Filament manager view
  if (showFilamentManager) {
    return <FilamentManager onBack={() => {
      setShowFilamentManager(false);
      // Refresh data since substitutions may have changed
      setSidebarRefreshKey((k) => k + 1);
      loadProjects();
    }} />;
  }

  // Settings view
  if (showSettings) {
    return <Settings onBack={() => setShowSettings(false)} onLibraryChanged={() => {
      // Reset all filters and navigation state when library changes
      setSearch("");
      setSelectedTags([]);
      setExcludedTags([]);
      setSelectedCollection(undefined);
      setSelectedFilaments([]);
      setExcludedFilaments([]);
      setNoFilamentFilter(undefined);
      setSelectedSize(undefined);
      setExcludedSizes([]);
      setActiveProjectId(null);
      navHistoryRef.current = [];
      navForwardRef.current = [];
      setSidebarRefreshKey((k) => k + 1);
      loadProjects();
    }} />;
  }

  // Project detail view
  if (activeProjectId) {
    return (
      <ProjectDetail
        projectId={activeProjectId}
        onBack={handleBack}
        onDeleted={handleBack}
        onDuplicated={(newId) => navigateTo(newId)}
        onFilterByFilaments={(ids) => {
          setSearch("");
          setSelectedTags([]);
          setExcludedTags([]);
          setSelectedCollection(undefined);
          setExcludedFilaments([]);
          setSelectedSize(undefined);
          setExcludedSizes([]);
          _setNoFilamentFilter(undefined);
          setOwnedOnly(false);
          setAllOwned(false);
          setSelectedFilaments(ids);
          navigateTo(null);
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
        excludedTags={excludedTags}
        onExcludedTagsChange={setExcludedTags}
        selectedCollection={selectedCollection}
        onCollectionChange={setSelectedCollection}
        selectedFilaments={selectedFilaments}
        onFilamentsChange={setSelectedFilaments}
        excludedFilaments={excludedFilaments}
        onExcludedFilamentsChange={setExcludedFilaments}
        noFilamentFilter={noFilamentFilter}
        onNoFilamentFilterChange={setNoFilamentFilter}
        ownedOnly={ownedOnly}
        onOwnedOnlyChange={setOwnedOnly}
        allOwned={allOwned}
        onAllOwnedChange={setAllOwned}
        selectedSize={selectedSize}
        onSizeChange={setSelectedSize}
        excludedSizes={excludedSizes}
        onExcludedSizesChange={setExcludedSizes}
        refreshKey={sidebarRefreshKey}
        hasSearch={search.length > 0}
        onClearAll={() => {
          setSearch("");
          setSelectedTags([]);
          setExcludedTags([]);
          setSelectedCollection(undefined);
          setSelectedFilaments([]);
          setExcludedFilaments([]);
          setNoFilamentFilter(undefined);
          setOwnedOnly(false);
          setAllOwned(false);
          setSelectedSize(undefined);
          setExcludedSizes([]);
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
          viewMode={viewMode}
          onViewModeChange={setViewMode}
          onCreateProject={() => setShowCreate(true)}
          onOpenFilamentManager={() => setShowFilamentManager(true)}
          onOpenSettings={() => setShowSettings(true)}
        />

        <BulkActions
          selectedIds={selectedProjectIds}
          onClear={() => setSelectedProjectIds([])}
          onRefresh={() => {
            loadProjects();
            setSidebarRefreshKey((k) => k + 1);
          }}
        />

        {viewMode === "grid" ? (
          <ProjectGrid
            projects={projects}
            onProjectClick={navigateTo}
            selectedIds={selectedProjectIds}
            onToggleSelect={handleToggleSelect}
            onFilamentClick={(key) => setSelectedFilaments((prev) =>
              prev.includes(key) ? prev : [...prev, key]
            )}
            onSizeClick={(size) => setSelectedSize(size)}
          />
        ) : (
          <ProjectTable
            projects={projects}
            onProjectClick={navigateTo}
            selectedIds={selectedProjectIds}
            onToggleSelect={handleToggleSelect}
            onFilamentClick={(key) => setSelectedFilaments((prev) =>
              prev.includes(key) ? prev : [...prev, key]
            )}
            onSizeClick={(size) => setSelectedSize(size)}
          />
        )}

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
