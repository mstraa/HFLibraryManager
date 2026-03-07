import { convertFileSrc } from "@tauri-apps/api/core";
import type { ProjectSummary } from "../lib/types";

const ASSET_TYPE_LABELS: Record<string, string> = {
  affinity: "Affinity",
  hueforge: "HueForge",
  bambulab: "BambuLab",
};

interface ProjectCardProps {
  project: ProjectSummary;
  onClick: (id: string) => void;
}

export default function ProjectCard({ project, onClick }: ProjectCardProps) {
  return (
    <div
      onClick={() => onClick(project.id)}
      className="group bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl overflow-hidden cursor-pointer hover:shadow-lg hover:border-indigo-300 dark:hover:border-indigo-600 transition-all duration-200"
    >
      {/* Thumbnail */}
      <div className="aspect-[4/3] bg-gray-100 dark:bg-gray-750 relative overflow-hidden">
        {project.thumbnail_path ? (
          <img
            src={convertFileSrc(project.thumbnail_path)}
            alt={project.name}
            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-gray-300 dark:text-gray-600">
            <svg className="w-12 h-12" fill="none" stroke="currentColor" viewBox="0 0 24 24">
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

      {/* Info */}
      <div className="p-3">
        <h3 className="text-sm font-medium text-gray-900 dark:text-gray-100 truncate">
          {project.name}
        </h3>

        <div className="flex flex-wrap gap-1 mt-2">
          {project.tags.map((tag) => (
            <span
              key={tag.id}
              className="text-[10px] px-1.5 py-0.5 rounded-full text-white font-medium"
              style={{ backgroundColor: tag.color }}
            >
              {tag.name}
            </span>
          ))}
        </div>

        {project.asset_types.length > 0 && (
          <div className="flex flex-wrap gap-1 mt-1.5">
            {project.asset_types.map((at) => (
              <span
                key={at}
                className="text-[10px] px-1.5 py-0.5 rounded bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-400"
              >
                {ASSET_TYPE_LABELS[at] ?? at}
              </span>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
