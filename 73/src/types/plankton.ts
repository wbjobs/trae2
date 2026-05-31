export type PlanktonCategory = 'phytoplankton' | 'zooplankton';

export interface PlanktonData {
  id: string;
  stationId: string;
  timestamp: string;
  species: string;
  category: PlanktonCategory;
  density: number;
  biomass: number;
}
