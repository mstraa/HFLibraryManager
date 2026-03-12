export interface Project {
  id: string;
  name: string;
  description: string;
  thumbnail_path: string | null;
  created_at: string;
  updated_at: string;
  tags: Tag[];
  collections: CollectionSummary[];
  print_width_mm: number | null;
  print_height_mm: number | null;
  print_time_mins: number | null;
  is_template: boolean;
}

export interface ProjectSummary {
  id: string;
  name: string;
  thumbnail_path: string | null;
  created_at: string;
  updated_at: string;
  tags: Tag[];
  file_count: number;
  filaments: ProjectFilamentDisplay[];
  size: string | null;
  starred_3mf_path: string | null;
  is_template: boolean;
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

export interface CuratedFilament {
  id: string;
  brand: string;
  line: string;
  material: string;
  name: string;
  color: string;
  transmission_distance: number | null;
  owned: boolean;
  source_uuid: string | null;
  created_at: string;
  updated_at: string;
}

export interface CuratedFilamentWithCount extends CuratedFilament {
  project_count: number;
}

export interface ProjectFilamentDisplay {
  project_filament_id: string;
  curated_filament_id: string | null;
  color: string;
  name: string;
  brand: string;
  line: string;
  material: string;
  match_status: "exact" | "guessed" | "unmatched" | "confirmed";
  owned: boolean;
  td: number | null;
  parsed_color: string;
  parsed_brand: string;
  parsed_name: string;
  parsed_td: number | null;
  is_manual: boolean;
}

export interface FilamentInfo {
  color: string;
  name: string;
  brand: string;
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
  filament_ids?: string[];
  size?: string;
  exclude_tag_ids?: string[];
  exclude_filament_ids?: string[];
  exclude_sizes?: string[];
  no_filament?: "include" | "exclude";
  owned_only?: boolean;
  all_owned?: boolean;
  sort_by?: SortBy;
  sort_order?: SortOrder;
  is_template?: boolean;
}
