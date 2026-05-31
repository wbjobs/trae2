export interface Result<T = any> {
  code: number;
  message: string;
  data: T;
}

export interface PageResult<T = any> {
  total: number;
  pageNum: number;
  pageSize: number;
  list: T[];
}

export interface Tag {
  id: string;
  tagName: string;
  tagCode: string;
  tagType: string;
  color: string;
  description: string;
  useCount: number;
  createdAt: Date;
}

export interface TagAutoClassifyResult {
  assetId: string;
  assetTitle: string;
  matchedTags: Tag[];
  matchedKeywords: string[];
  classifyReason: string;
}
