export interface Project {
  id: string;
  name: string;
  description: string;
  thumbnail_path: string | null;
  created_at: string;
  updated_at: string;
  tags: Tag[];
  collections: CollectionSummary[];
}

export interface ProjectSummary {
  id: string;
  name: string;
  thumbnail_path: string | null;
  created_at: string;
  updated_at: string;
  tags: Tag[];
  file_count: number;
  filaments: ResolvedFilament[];
  size: string | null;
}

export interface Tag {
  id: string;
  name: string;
  color: string;
}

export interface TagWithCount extends Tag {
  project_count: number;
}

export interface Collection {
  id: string;
  name: string;
  description: string;
  cover_image_path: string | null;
  created_at: string;
  updated_at: string;
  project_count: number;
}

export interface CollectionSummary {
  id: string;
  name: string;
}

export interface FilamentInfo {
  color: string;
  name: string;
  brand: string;
}

export interface ResolvedFilament {
  current: FilamentInfo;
  original: FilamentInfo | null;  // non-null if this was substituted
}

export interface FilamentSubstitution {
  from_key: string;
  from: FilamentInfo;
  to_key: string;
  to: FilamentInfo;
}

export function filamentKey(f: FilamentInfo): string {
  return `${f.color.toLowerCase()}|${f.brand}|${f.name}`;
}

export interface FileMetadata {
  filament_count?: number;
  filaments?: FilamentInfo[];
  width_mm?: number;
  height_mm?: number;
  layer_height?: number;
  max_thickness?: number;
}

export interface ProjectFile {
  id: string;
  project_id: string;
  file_path: string;
  original_filename: string;
  file_size: number;
  notes: string;
  thumbnail_path: string | null;
  favorited: boolean;
  metadata: string;
  created_at: string;
  modified_at: string;
}

export type SortBy = "name" | "created_at" | "updated_at";
export type SortOrder = "asc" | "desc";
export type ViewMode = "grid" | "table";
export type ThumbnailMode = "cover" | "contain" | "full";

export interface ListProjectsRequest {
  search?: string;
  tag_ids?: string[];
  collection_id?: string;
  filaments?: string[];
  size?: string;
  exclude_tag_ids?: string[];
  exclude_filaments?: string[];
  exclude_sizes?: string[];
  no_filament?: "include" | "exclude";
  sort_by?: SortBy;
  sort_order?: SortOrder;
}
