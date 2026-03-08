export interface Project {
  id: string;
  name: string;
  description: string;
  creator: string;
  thumbnail_path: string | null;
  created_at: string;
  updated_at: string;
  tags: Tag[];
  collections: CollectionSummary[];
}

export interface ProjectSummary {
  id: string;
  name: string;
  creator: string;
  thumbnail_path: string | null;
  created_at: string;
  updated_at: string;
  tags: Tag[];
  file_count: number;
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

export interface ProjectFile {
  id: string;
  project_id: string;
  file_path: string;
  original_filename: string;
  file_size: number;
  notes: string;
  thumbnail_path: string | null;
  favorited: boolean;
  created_at: string;
}

export type SortBy = "name" | "created_at" | "updated_at";
export type SortOrder = "asc" | "desc";

export interface ListProjectsRequest {
  search?: string;
  tag_ids?: string[];
  collection_id?: string;
  creator?: string;
  sort_by?: SortBy;
  sort_order?: SortOrder;
}
