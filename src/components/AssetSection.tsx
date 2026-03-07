import { convertFileSrc } from "@tauri-apps/api/core";
import { open } from "@tauri-apps/plugin-dialog";
import {
  importFile,
  openFileInDefaultApp,
  deleteRevision,
  setRevisionThumbnail,
} from "../lib/api";
import type { Asset, AssetType } from "../lib/types";

const ASSET_CONFIG: Record<AssetType, { label: string; color: string; extensions: string[] }> = {
  design: {
    label: "Design / Images",
    color: "#4a90d9",
    extensions: ["afdesign", "afphoto", "afpub", "psd", "ai", "svg", "png", "jpg", "jpeg", "tiff", "webp", "gif", "bmp", "xcf", "kra"],
  },
  hueforge: {
    label: "HueForge",
    color: "#e67e22",
    extensions: ["hfp", "hfm"],
  },
  bambulab: {
    label: "BambuLab Studio",
    color: "#2ecc71",
    extensions: ["3mf"],
  },
};

interface AssetSectionProps {
  assetType: AssetType;
  asset: Asset | undefined;
  projectId: string;
  onRefresh: () => void;
}

export default function AssetSection({ assetType, asset, projectId, onRefresh }: AssetSectionProps) {
  const config = ASSET_CONFIG[assetType];
  const revisions = asset?.revisions ?? [];

  async function handleImport() {
    const selected = await open({
      multiple: false,
      filters: [{ name: config.label, extensions: config.extensions }],
    });
    if (!selected) return;

    const path = typeof selected === "string" ? selected : (selected as { path: string }).path;
    if (!path) return;
    await importFile(projectId, assetType, path);
    onRefresh();
  }

  async function handleOpenFile(filePath: string) {
    await openFileInDefaultApp(filePath);
  }

  async function handleDeleteRevision(revisionId: string) {
    await deleteRevision(revisionId);
    onRefresh();
  }

  async function handleSetRevisionThumbnail(revisionId: string) {
    const selected = await open({
      multiple: false,
      filters: [{ name: "Images", extensions: ["png", "jpg", "jpeg", "webp", "gif"] }],
    });
    if (!selected) return;
    const path = typeof selected === "string" ? selected : (selected as { path: string }).path;
    if (!path) return;
    await setRevisionThumbnail(revisionId, path);
    onRefresh();
  }

  function formatDate(iso: string) {
    return new Date(iso).toLocaleDateString(undefined, {
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  }

  return (
    <div className="border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden">
      {/* Header */}
      <div
        className="flex items-center justify-between px-4 py-3"
        style={{ backgroundColor: config.color + "15" }}
      >
        <div className="flex items-center gap-2">
          <div
            className="w-3 h-3 rounded-full"
            style={{ backgroundColor: config.color }}
          />
          <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100">
            {config.label}
          </h3>
          <span className="text-xs text-gray-500 dark:text-gray-400">
            {revisions.length} revision{revisions.length !== 1 ? "s" : ""}
          </span>
        </div>
        <button
          onClick={handleImport}
          className="text-xs px-3 py-1.5 rounded-lg text-white font-medium transition-colors cursor-pointer hover:opacity-90"
          style={{ backgroundColor: config.color }}
        >
          + Import
        </button>
      </div>

      {/* Revisions */}
      {revisions.length > 0 ? (
        <div className="divide-y divide-gray-100 dark:divide-gray-800">
          {revisions.map((rev) => (
            <div key={rev.id} className="flex items-center gap-3 px-4 py-3 hover:bg-gray-50 dark:hover:bg-gray-800/50">
              {/* Thumbnail */}
              <div
                onClick={() => !rev.thumbnail_path && handleSetRevisionThumbnail(rev.id)}
                className={`w-10 h-10 rounded bg-gray-100 dark:bg-gray-700 flex items-center justify-center shrink-0 overflow-hidden ${
                  !rev.thumbnail_path ? "cursor-pointer hover:bg-gray-200 dark:hover:bg-gray-600" : ""
                }`}
                title={rev.thumbnail_path ? undefined : "Click to set thumbnail"}
              >
                {rev.thumbnail_path ? (
                  <img
                    src={convertFileSrc(rev.thumbnail_path)}
                    alt=""
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <span className="text-gray-400 text-xs font-mono">
                    v{rev.version_number}
                  </span>
                )}
              </div>

              {/* Info */}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium text-gray-900 dark:text-gray-100">
                    v{rev.version_number}
                  </span>
                  <span className="text-xs text-gray-500 dark:text-gray-400 truncate">
                    {rev.original_filename}
                  </span>
                </div>
                <div className="text-xs text-gray-400 dark:text-gray-500">
                  {formatDate(rev.created_at)}
                  {rev.notes && (
                    <span className="ml-2 text-gray-500 dark:text-gray-400">{rev.notes}</span>
                  )}
                </div>
              </div>

              {/* Actions */}
              <div className="flex items-center gap-1">
                <button
                  onClick={() => handleSetRevisionThumbnail(rev.id)}
                  className="p-1.5 text-gray-400 hover:text-amber-500 rounded hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors cursor-pointer"
                  title="Set thumbnail"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                  </svg>
                </button>
                <button
                  onClick={() => handleOpenFile(rev.file_path)}
                  className="p-1.5 text-gray-400 hover:text-indigo-500 rounded hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors cursor-pointer"
                  title="Open in default app"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                  </svg>
                </button>
                <button
                  onClick={() => handleDeleteRevision(rev.id)}
                  className="p-1.5 text-gray-400 hover:text-red-500 rounded hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors cursor-pointer"
                  title="Delete revision"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                  </svg>
                </button>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="px-4 py-6 text-center text-sm text-gray-400 dark:text-gray-500">
          No files imported yet. Click Import to add your first revision.
        </div>
      )}
    </div>
  );
}
