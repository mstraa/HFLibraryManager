import type { ProjectSummary } from "../lib/types";
import ProjectCard from "./ProjectCard";

interface ProjectGridProps {
  projects: ProjectSummary[];
  onProjectClick: (id: string) => void;
  selectedIds: string[];
  onToggleSelect: (id: string) => void;
}

export default function ProjectGrid({
  projects,
  onProjectClick,
  selectedIds,
  onToggleSelect,
}: ProjectGridProps) {
  const selectionMode = selectedIds.length > 0;

  if (projects.length === 0) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <div className="text-center">
          <svg
            className="w-16 h-16 mx-auto text-gray-300 dark:text-gray-600 mb-4"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={1.5}
              d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4"
            />
          </svg>
          <p className="text-gray-500 dark:text-gray-400 text-sm">No projects found</p>
          <p className="text-gray-400 dark:text-gray-500 text-xs mt-1">
            Create a new project or adjust your filters
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-y-auto p-4">
      <div className="grid grid-cols-[repeat(auto-fill,minmax(200px,1fr))] gap-4">
        {projects.map((project) => (
          <ProjectCard
            key={project.id}
            project={project}
            onClick={onProjectClick}
            selected={selectedIds.includes(project.id)}
            selectionMode={selectionMode}
            onToggleSelect={onToggleSelect}
          />
        ))}
      </div>
    </div>
  );
}
