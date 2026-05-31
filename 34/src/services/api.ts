class ApiService {
  private baseUrl = '/api';

  async getStations() {
    const res = await fetch(`${this.baseUrl}/stations`);
    return res.json();
  }

  async getStationById(stationId: string) {
    const res = await fetch(`${this.baseUrl}/stations/${stationId}`);
    return res.json();
  }

  async getRealTimeFlow() {
    const res = await fetch(`${this.baseUrl}/flow/realtime`);
    return res.json();
  }

  async getHistoricalFlow(hours: number = 24) {
    const res = await fetch(`${this.baseUrl}/flow/history?hours=${hours}`);
    return res.json();
  }

  async getStationFlow(stationId: string, hours: number = 24) {
    const res = await fetch(`${this.baseUrl}/flow/station/${stationId}?hours=${hours}`);
    return res.json();
  }

  async getTimeSeriesFeatures(stationId?: string) {
    const url = stationId
      ? `${this.baseUrl}/flow/timeseries-features?stationId=${stationId}`
      : `${this.baseUrl}/flow/timeseries-features`;
    const res = await fetch(url);
    return res.json();
  }

  async getClusteringResults() {
    const res = await fetch(`${this.baseUrl}/clustering/results`);
    return res.json();
  }

  async getStationCluster(stationId: string) {
    const res = await fetch(`${this.baseUrl}/clustering/station/${stationId}`);
    return res.json();
  }

  async getAlerts(limit: number = 50) {
    const res = await fetch(`${this.baseUrl}/alerts?limit=${limit}`);
    return res.json();
  }

  async getStationAlerts(stationId: string, limit: number = 20) {
    const res = await fetch(`${this.baseUrl}/alerts/station/${stationId}?limit=${limit}`);
    return res.json();
  }

  async getActiveAlertCount() {
    const res = await fetch(`${this.baseUrl}/alerts/active-count`);
    return res.json();
  }

  async getAlertThresholds() {
    const res = await fetch(`${this.baseUrl}/alerts/thresholds`);
    return res.json();
  }

  async updateAlertThresholds(thresholds: Partial<import('@/types').AlertThreshold>) {
    const res = await fetch(`${this.baseUrl}/alerts/thresholds`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(thresholds),
    });
    return res.json();
  }

  async getPeakHourStats() {
    const res = await fetch(`${this.baseUrl}/stats/peak-hours`);
    return res.json();
  }

  async getStationStats() {
    const res = await fetch(`${this.baseUrl}/stats/station-stats`);
    return res.json();
  }

  async getOverviewStats() {
    const res = await fetch(`${this.baseUrl}/stats/overview`);
    return res.json();
  }

  async getHeatmapData() {
    const res = await fetch(`${this.baseUrl}/stats/heatmap`);
    return res.json();
  }

  async getPrediction(stationId: string, hours: number = 6) {
    const res = await fetch(`${this.baseUrl}/flow/predict/${stationId}?hours=${hours}`);
    return res.json();
  }

  async getBatchPredictions(hours: number = 3) {
    const res = await fetch(`${this.baseUrl}/flow/predict-all?hours=${hours}`);
    return res.json();
  }

  async getRankings() {
    const res = await fetch(`${this.baseUrl}/flow/rankings`);
    return res.json();
  }
}

export const apiService = new ApiService();
