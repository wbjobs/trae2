export interface AssetVersion {
  id: string;
  assetId: string;
  versionNumber: number;
  versionTag: string;
  changeDescription: string;
  createdByName: string;
  createdAt: Date;
}

export interface VersionCreate {
  assetId: string;
  versionTag: string;
  changeDescription: string;
}
