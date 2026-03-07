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
  asset_types: string[];
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

export interface Asset {
  id: string;
  project_id: string;
  asset_type: "design" | "hueforge" | "bambulab";
  created_at: string;
  revisions: Revision[];
}

export interface Revision {
  id: string;
  asset_id: string;
  version_number: number;
  file_path: string;
  original_filename: string;
  notes: string;
  thumbnail_path: string | null;
  created_at: string;
}

export type AssetType = "design" | "hueforge" | "bambulab";
export type SortBy = "name" | "created_at" | "updated_at";
export type SortOrder = "asc" | "desc";

export interface ListProjectsRequest {
  search?: string;
  tag_ids?: string[];
  collection_id?: string;
  asset_types?: string[];
  sort_by?: SortBy;
  sort_order?: SortOrder;
}
