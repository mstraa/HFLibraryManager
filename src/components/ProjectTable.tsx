import { convertFileSrc } from "@tauri-apps/api/core";
import type { ProjectSummary } from "../lib/types";
import { formatRelativeDate } from "../lib/formatting";
import FilamentBadge from "./FilamentBadge";
import TagBadges from "./TagBadges";

interface ProjectTableProps {
  projects: ProjectSummary[];
  onProjectClick: (id: string) => void;
  selectedIds: string[];
  onToggleSelect: (id: string) => void;
  onFilamentClick?: (hexColor: string) => void;
  onSizeClick?: (size: string) => void;
  onPrintClick?: (path: string) => void;
}

export default function ProjectTable({
  projects,
  onProjectClick,
  selectedIds,
  onToggleSelect,
  onFilamentClick,
  onSizeClick,
  onPrintClick,
}: ProjectTableProps) {
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

  function handleRowClick(id: string, e: React.MouseEvent) {
    if (selectionMode) {
      onToggleSelect(id);
    } else if (e.metaKey || e.ctrlKey) {
      onToggleSelect(id);
    } else {
      onProjectClick(id);
    }
  }

  return (
    <div className="flex-1 overflow-y-auto">
      <table className="w-full text-sm">
        <thead className="sticky top-0 bg-gray-50 dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 z-10">
          <tr>
            {selectionMode && (
              <th className="w-10 px-3 py-2" />
            )}
            <th className="w-12 px-3 py-2" />
            <th className="text-left px-3 py-2 font-medium text-gray-500 dark:text-gray-400 text-xs uppercase tracking-wider">
              Name
            </th>
            <th className="text-left px-3 py-2 font-medium text-gray-500 dark:text-gray-400 text-xs uppercase tracking-wider">
              Filaments
            </th>
            <th className="text-left px-3 py-2 font-medium text-gray-500 dark:text-gray-400 text-xs uppercase tracking-wider">
              Size
            </th>
            <th className="text-center px-3 py-2 font-medium text-gray-500 dark:text-gray-400 text-xs uppercase tracking-wider">
              Files
            </th>
            <th className="text-left px-3 py-2 font-medium text-gray-500 dark:text-gray-400 text-xs uppercase tracking-wider">
              Tags
            </th>
            <th className="text-right px-3 py-2 font-medium text-gray-500 dark:text-gray-400 text-xs uppercase tracking-wider">
              Modified
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
          {projects.map((project) => {
            const isSelected = selectedIds.includes(project.id);
            return (
              <tr
                key={project.id}
                onClick={(e) => handleRowClick(project.id, e)}
                className={`cursor-pointer transition-colors ${
                  isSelected
                    ? "bg-indigo-50 dark:bg-indigo-900/20"
                    : "hover:bg-gray-50 dark:hover:bg-gray-800/50"
                }`}
              >
                {selectionMode && (
                  <td className="px-3 py-2">
                    <div
                      className={`w-4 h-4 rounded border-2 flex items-center justify-center transition-colors ${
                        isSelected
                          ? "bg-indigo-500 border-indigo-500"
                          : "bg-white dark:bg-gray-700 border-gray-300 dark:border-gray-500"
                      }`}
                    >
                      {isSelected && (
                        <svg className="w-2.5 h-2.5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                        </svg>
                      )}
                    </div>
                  </td>
                )}

                {/* Thumbnail */}
                <td className="px-3 py-2">
                  <div className="w-8 h-8 rounded bg-gray-100 dark:bg-gray-750 overflow-hidden shrink-0">
                    {project.thumbnail_path ? (
                      <img
                        src={convertFileSrc(project.thumbnail_path) + "?v=" + encodeURIComponent(project.updated_at)}
                        alt={project.name}
                        loading="lazy"
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-gray-300 dark:text-gray-600">
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={1.5}
                            d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"
                          />
                        </svg>
                      </div>
                    )}
                  </div>
                </td>

                {/* Name */}
                <td className="px-3 py-2">
                  <div className="flex items-center gap-1.5">
                    <span className="font-medium text-gray-900 dark:text-gray-100">
                      {project.name}
                    </span>
                    {project.starred_3mf_path && onPrintClick && (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          onPrintClick(project.starred_3mf_path!);
                        }}
                        className="p-0.5 text-gray-400 hover:text-indigo-500 transition-colors cursor-pointer shrink-0"
                        title="Open in Bambu Studio"
                      >
                        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" />
                        </svg>
                      </button>
                    )}
                  </div>
                </td>

                {/* Filaments */}
                <td className="px-3 py-2">
                  {project.filaments.length > 0 && (
                    <div className="flex gap-1">
                      {project.filaments.map((pf) => (
                        <FilamentBadge key={pf.project_filament_id} filament={pf} onFilamentClick={onFilamentClick} />
                      ))}
                    </div>
                  )}
                </td>

                {/* Size */}
                <td className="px-3 py-2">
                  {project.size && (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        onSizeClick?.(project.size!);
                      }}
                      className="text-[10px] px-1.5 py-0.5 rounded-full border border-gray-300 dark:border-gray-600 text-gray-600 dark:text-gray-400 hover:border-indigo-400 hover:text-indigo-600 dark:hover:border-indigo-500 dark:hover:text-indigo-400 cursor-pointer transition-colors"
                    >
                      {project.size}
                    </button>
                  )}
                </td>

                {/* Files */}
                <td className="px-3 py-2 text-center text-gray-500 dark:text-gray-400">
                  {project.file_count || "—"}
                </td>

                {/* Tags */}
                <td className="px-3 py-2">
                  <TagBadges tags={project.tags} />
                </td>

                {/* Modified */}
                <td className="px-3 py-2 text-right text-gray-400 dark:text-gray-500 whitespace-nowrap">
                  {formatRelativeDate(project.updated_at)}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
