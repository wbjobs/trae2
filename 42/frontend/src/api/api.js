const API_BASE = window.location.origin;

const api = {
  async getHealth() {
    const response = await fetch(`${API_BASE}/api/health`);
    return response.json();
  },

  async getConfig() {
    const response = await fetch(`${API_BASE}/api/config`);
    return response.json();
  },

  async getNodes() {
    const response = await fetch(`${API_BASE}/api/nodes`);
    return response.json();
  },

  async getChannels() {
    const response = await fetch(`${API_BASE}/api/channels`);
    return response.json();
  },

  async getRecentAnalysis(limit = 100) {
    const response = await fetch(`${API_BASE}/api/analysis/recent?limit=${limit}`);
    return response.json();
  },

  async getAlerts(limit = 50) {
    const response = await fetch(`${API_BASE}/api/alerts?limit=${limit}`);
    return response.json();
  },

  async getAuditLogs(page = 1, pageSize = 20, category = null) {
    let url = `${API_BASE}/api/audit?page=${page}&pageSize=${pageSize}`;
    if (category) url += `&category=${category}`;
    const response = await fetch(url);
    return response.json();
  }
};
