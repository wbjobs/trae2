export interface Resource {
  id: string;
  name: string;
  scientific_name: string;
  category_id: string | null;
  family: string;
  genus: string;
  species: string;
  description: string | null;
  origin: string | null;
  habitat: string | null;
  protection_level: string | null;
  latitude: number | null;
  longitude: number | null;
  altitude: number | null;
  address: string | null;
  province: string | null;
  city: string | null;
  district: string | null;
  surveyor: string | null;
  survey_date: string | null;
  created_at: string;
  updated_at: string;
}

export interface ResourceWithRelations extends Resource {
  category: Category | null;
  growth_records: GrowthRecord[];
  images: FieldImage[];
}

export interface GrowthRecord {
  id: string;
  resource_id: string;
  record_date: string;
  height_cm: number | null;
  dbh_cm: number | null;
  crown_width_m: number | null;
  health_status: string | null;
  phenology: string | null;
  notes: string | null;
  recorder: string | null;
  created_at: string;
  updated_at: string;
  resource_name?: string;
  scientific_name?: string;
}

export interface Category {
  id: string;
  name: string;
  parent_id: string | null;
  code: string | null;
  description: string | null;
  sort_order: number;
  created_at: string;
  updated_at: string;
}

export interface CategoryWithChildren extends Category {
  children: CategoryWithChildren[];
}

export interface FieldImage {
  id: string;
  resource_id: string;
  file_name: string;
  original_name: string;
  file_path: string;
  file_size: number;
  mime_type: string;
  description: string | null;
  taken_date: string | null;
  location: string | null;
  photographer: string | null;
  created_at: string;
  resource_name?: string;
  scientific_name?: string;
}

export interface ApiResponse<T = any> {
  success: boolean;
  data?: T;
  message?: string;
  error?: string;
}

export interface PaginatedResponse<T = any> {
  success: boolean;
  data: T[];
  pagination: {
    page: number;
    page_size: number;
    total: number;
    total_pages: number;
  };
}

export interface ResourceStats {
  total_resources: number;
  total_families: number;
  total_genera: number;
  total_species: number;
  total_provinces: number;
  level1_protected: number;
  level2_protected: number;
  category_stats: Array<{
    id: string;
    name: string;
    code: string;
    resource_count: number;
  }>;
}

export interface GrowthStats {
  total_records: number;
  first_record: GrowthRecord | null;
  last_record: GrowthRecord | null;
  height_change: number | null;
  dbh_change: number | null;
  growth_rate_per_year: {
    height: number | null;
    dbh: number | null;
  } | null;
}

export interface GeoCodeResult {
  province: string | null;
  city: string | null;
  district: string | null;
  address: string;
  formatted_address: string;
}
