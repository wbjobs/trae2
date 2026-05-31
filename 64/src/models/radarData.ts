export interface RadarBaseData {
  id: string;
  radarId: string;
  timestamp: number;
  dataType: 'reflectivity' | 'velocity' | 'spectrum_width' | 'differential_reflectivity' | 'correlation_coefficient';
  elevationAngle: number;
  azimuthAngle: number;
  range: number;
  resolution: number;
  data: number[];
  quality: number;
  checksum: string;
}

export interface RadarDataUploadRequest {
  radarId: string;
  timestamp: number;
  dataType: RadarBaseData['dataType'];
  elevationAngle: number;
  azimuthAngle: number;
  range: number;
  resolution: number;
  data: number[];
  quality: number;
  checksum: string;
}

export interface RadarDataQuery {
  radarId?: string;
  startTime?: number;
  endTime?: number;
  dataType?: RadarBaseData['dataType'];
  elevationAngle?: number;
  limit?: number;
  offset?: number;
}
