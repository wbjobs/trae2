export class DiseaseBatchManager {
  constructor(diseaseLayerManager) {
    this.diseaseLayerManager = diseaseLayerManager;

    this.selectedDiseases = new Set();
    this.searchQuery = '';
    this.advancedFilters = {
      dateRange: null,
      positionRange: null,
      sizeRange: null,
      customTags: []
    };

    this.sortBy = 'date';
    this.sortOrder = 'desc';

    this.onSelectionChange = null;
    this.onBatchAction = null;
  }

  search(query) {
    this.searchQuery = query.toLowerCase();
    return this.getFilteredDiseases();
  }

  setAdvancedFilters(filters) {
    this.advancedFilters = { ...this.advancedFilters, ...filters };
    return this.getFilteredDiseases();
  }

  setSortBy(field, order = 'desc') {
    this.sortBy = field;
    this.sortOrder = order;
    return this.getFilteredDiseases();
  }

  getFilteredDiseases() {
    let diseases = [...this.diseaseLayerManager.diseaseData];

    if (this.searchQuery) {
      diseases = diseases.filter(d => {
        const searchText = [
          d.id,
          d.type,
          d.severity,
          d.status,
          d.description,
          d.inspector,
          d.repairSuggestion
        ].join(' ').toLowerCase();
        return searchText.includes(this.searchQuery);
      });
    }

    diseases = diseases.filter(d => {
      const typeVisible = this.diseaseLayerManager.layers[d.type]?.visible ?? true;
      const severityVisible = this.diseaseLayerManager.severityFilters[d.severity] ?? true;
      const statusVisible = this.diseaseLayerManager.statusFilters[d.status] ?? true;
      return typeVisible && severityVisible && statusVisible;
    });

    if (this.advancedFilters.dateRange) {
      const { start, end } = this.advancedFilters.dateRange;
      diseases = diseases.filter(d => {
        const date = new Date(d.discoveryDate);
        return date >= start && date <= end;
      });
    }

    if (this.advancedFilters.positionRange) {
      const { xMin, xMax, yMin, yMax, zMin, zMax } = this.advancedFilters.positionRange;
      diseases = diseases.filter(d => {
        const pos = d.position || {};
        return (
          pos.x >= xMin && pos.x <= xMax &&
          pos.y >= yMin && pos.y <= yMax &&
          pos.z >= zMin && pos.z <= zMax
        );
      });
    }

    if (this.advancedFilters.sizeRange) {
      const { min, max } = this.advancedFilters.sizeRange;
      diseases = diseases.filter(d => {
        const size = d.length || d.area || 0;
        return size >= min && size <= max;
      });
    }

    if (this.advancedFilters.customTags && this.advancedFilters.customTags.length > 0) {
      diseases = diseases.filter(d => {
        const tags = d.tags || [];
        return this.advancedFilters.customTags.some(tag => tags.includes(tag));
      });
    }

    diseases.sort((a, b) => {
      let comparison = 0;

      switch (this.sortBy) {
        case 'date':
          comparison = new Date(a.discoveryDate) - new Date(b.discoveryDate);
          break;
        case 'severity':
          const severityOrder = { severe: 3, moderate: 2, minor: 1 };
          comparison = severityOrder[a.severity] - severityOrder[b.severity];
          break;
        case 'type':
          comparison = a.type.localeCompare(b.type);
          break;
        case 'status':
          comparison = a.status.localeCompare(b.status);
          break;
        case 'position':
          comparison = (a.position?.z || 0) - (b.position?.z || 0);
          break;
        default:
          comparison = 0;
      }

      return this.sortOrder === 'desc' ? -comparison : comparison;
    });

    return diseases;
  }

  selectDisease(diseaseId, selected = true) {
    if (selected) {
      this.selectedDiseases.add(diseaseId);
    } else {
      this.selectedDiseases.delete(diseaseId);
    }

    if (this.onSelectionChange) {
      this.onSelectionChange(this.getSelectedDiseases());
    }

    this.updateMarkerSelection(diseaseId, selected);

    return this.selectedDiseases.size;
  }

  selectAll(filteredOnly = true) {
    const diseases = filteredOnly ? this.getFilteredDiseases() : this.diseaseLayerManager.diseaseData;
    diseases.forEach(d => {
      this.selectedDiseases.add(d.id);
      this.updateMarkerSelection(d.id, true);
    });

    if (this.onSelectionChange) {
      this.onSelectionChange(this.getSelectedDiseases());
    }

    return this.selectedDiseases.size;
  }

  clearSelection() {
    this.selectedDiseases.forEach(id => {
      this.updateMarkerSelection(id, false);
    });
    this.selectedDiseases.clear();

    if (this.onSelectionChange) {
      this.onSelectionChange([]);
    }

    return 0;
  }

  invertSelection(filteredOnly = true) {
    const diseases = filteredOnly ? this.getFilteredDiseases() : this.diseaseLayerManager.diseaseData;
    diseases.forEach(d => {
      if (this.selectedDiseases.has(d.id)) {
        this.selectedDiseases.delete(d.id);
        this.updateMarkerSelection(d.id, false);
      } else {
        this.selectedDiseases.add(d.id);
        this.updateMarkerSelection(d.id, true);
      }
    });

    if (this.onSelectionChange) {
      this.onSelectionChange(this.getSelectedDiseases());
    }

    return this.selectedDiseases.size;
  }

  updateMarkerSelection(diseaseId, selected) {
    const marker = this.diseaseLayerManager.getMarkerById(diseaseId);
    if (marker) {
      if (selected) {
        marker.scale.setScalar(1.4);
        marker.userData.batchSelected = true;
      } else {
        if (!marker.userData.isPulse) {
          marker.scale.setScalar(1);
        }
        marker.userData.batchSelected = false;
      }
    }
  }

  getSelectedDiseases() {
    return this.diseaseLayerManager.diseaseData.filter(d =>
      this.selectedDiseases.has(d.id)
    );
  }

  getSelectedCount() {
    return this.selectedDiseases.size;
  }

  async batchUpdate(updates) {
    const results = {
      success: [],
      failed: []
    };

    for (const diseaseId of this.selectedDiseases) {
      try {
        this.diseaseLayerManager.updateDisease(diseaseId, updates);
        results.success.push(diseaseId);
      } catch (error) {
        results.failed.push({ id: diseaseId, error });
      }
    }

    if (this.onBatchAction) {
      this.onBatchAction('update', results);
    }

    return results;
  }

  async batchDelete() {
    const results = {
      success: [],
      failed: []
    };

    const idsToDelete = [...this.selectedDiseases];
    for (const diseaseId of idsToDelete) {
      try {
        this.diseaseLayerManager.removeDisease(diseaseId);
        this.selectedDiseases.delete(diseaseId);
        results.success.push(diseaseId);
      } catch (error) {
        results.failed.push({ id: diseaseId, error });
      }
    }

    if (this.onBatchAction) {
      this.onBatchAction('delete', results);
    }

    return results;
  }

  async batchExport(format = 'json') {
    const selected = this.getSelectedDiseases();

    if (format === 'json') {
      return JSON.stringify(selected, null, 2);
    } else if (format === 'csv') {
      const headers = ['id', 'type', 'severity', 'status', 'description', 'position_x', 'position_y', 'position_z', 'discoveryDate', 'inspector'];
      const rows = selected.map(d => {
        const pos = d.position || {};
        return headers.map(h => {
          if (h.startsWith('position_')) {
            const axis = h.split('_')[1];
            return `"${pos[axis] || 0}"`;
          }
          return `"${d[h] || ''}"`;
        }).join(',');
      });
      return [headers.join(','), ...rows].join('\n');
    }

    return null;
  }

  async batchReport() {
    const selected = this.getSelectedDiseases();
    const stats = this.getSelectionStatistics();

    const report = {
      generatedAt: new Date().toISOString(),
      totalSelected: selected.length,
      statistics: stats,
      diseases: selected,
      summary: this.generateSummary(selected, stats)
    };

    return report;
  }

  getSelectionStatistics() {
    const selected = this.getSelectedDiseases();
    const stats = {
      total: selected.length,
      byType: {},
      bySeverity: { minor: 0, moderate: 0, severe: 0 },
      byStatus: { pending: 0, repairing: 0, repaired: 0 },
      byInspector: {}
    };

    selected.forEach(d => {
      stats.byType[d.type] = (stats.byType[d.type] || 0) + 1;
      stats.bySeverity[d.severity] = (stats.bySeverity[d.severity] || 0) + 1;
      stats.byStatus[d.status] = (stats.byStatus[d.status] || 0) + 1;
      stats.byInspector[d.inspector] = (stats.byInspector[d.inspector] || 0) + 1;
    });

    return stats;
  }

  generateSummary(diseases, stats) {
    const severeCount = stats.bySeverity.severe;
    const pendingCount = stats.byStatus.pending;

    let urgency = '低';
    if (severeCount > 5 || pendingCount > 10) {
      urgency = '高';
    } else if (severeCount > 0 || pendingCount > 5) {
      urgency = '中';
    }

    return {
      urgency,
      recommendations: this.generateRecommendations(diseases, stats),
      estimatedRepairDays: Math.ceil(diseases.length * 0.5),
      estimatedCost: this.estimateCost(diseases, stats)
    };
  }

  generateRecommendations(diseases, stats) {
    const recommendations = [];

    if (stats.bySeverity.severe > 0) {
      recommendations.push(`优先处理 ${stats.bySeverity.severe} 处严重病害`);
    }

    const crackCount = stats.byType.crack || 0;
    if (crackCount > 3) {
      recommendations.push('建议对裂缝病害进行专项检测');
    }

    const corrosionCount = stats.byType.corrosion || 0;
    if (corrosionCount > 2) {
      recommendations.push('锈蚀病害较多，建议评估整体防腐状况');
    }

    if (stats.byStatus.pending > 5) {
      recommendations.push('待处理病害较多，建议增加维修资源');
    }

    return recommendations;
  }

  estimateCost(diseases, stats) {
    const costBySeverity = { minor: 500, moderate: 2000, severe: 8000 };
    let total = 0;

    diseases.forEach(d => {
      const baseCost = costBySeverity[d.severity] || 1000;
      const sizeMultiplier = (d.length || d.area || 1);
      total += baseCost * Math.max(1, sizeMultiplier / 10);
    });

    return Math.round(total);
  }

  getFilterPresets() {
    return [
      {
        id: 'urgent',
        name: '紧急处理',
        description: '严重且待处理的病害',
        filters: {
          severityFilters: { severe: true, moderate: false, minor: false },
          statusFilters: { pending: true, repairing: false, repaired: false }
        }
      },
      {
        id: 'recent',
        name: '近期发现',
        description: '近30天发现的病害',
        filters: {
          dateRange: {
            start: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000),
            end: new Date()
          }
        }
      },
      {
        id: 'structure',
        name: '结构相关',
        description: '裂缝、变形类病害',
        filters: {
          layers: {
            crack: { visible: true },
            deformation: { visible: true },
            spalling: { visible: false },
            corrosion: { visible: false },
            missing: { visible: false }
          }
        }
      },
      {
        id: 'repaired',
        name: '已修复',
        description: '处理完成的病害',
        filters: {
          statusFilters: { pending: false, repairing: false, repaired: true }
        }
      }
    ];
  }

  applyPreset(presetId) {
    const presets = this.getFilterPresets();
    const preset = presets.find(p => p.id === presetId);
    if (!preset) return null;

    if (preset.filters.severityFilters) {
      Object.assign(this.diseaseLayerManager.severityFilters, preset.filters.severityFilters);
    }
    if (preset.filters.statusFilters) {
      Object.assign(this.diseaseLayerManager.statusFilters, preset.filters.statusFilters);
    }
    if (preset.filters.layers) {
      Object.entries(preset.filters.layers).forEach(([type, config]) => {
        if (this.diseaseLayerManager.layers[type]) {
          this.diseaseLayerManager.layers[type].visible = config.visible;
        }
      });
    }
    if (preset.filters.dateRange) {
      this.advancedFilters.dateRange = preset.filters.dateRange;
    }

    this.diseaseLayerManager.applyFilters();

    return this.getFilteredDiseases();
  }

  resetFilters() {
    this.searchQuery = '';
    this.advancedFilters = {
      dateRange: null,
      positionRange: null,
      sizeRange: null,
      customTags: []
    };
    this.sortBy = 'date';
    this.sortOrder = 'desc';

    Object.keys(this.diseaseLayerManager.layers).forEach(type => {
      this.diseaseLayerManager.layers[type].visible = true;
    });
    Object.keys(this.diseaseLayerManager.severityFilters).forEach(s => {
      this.diseaseLayerManager.severityFilters[s] = true;
    });
    Object.keys(this.diseaseLayerManager.statusFilters).forEach(s => {
      this.diseaseLayerManager.statusFilters[s] = true;
    });

    this.diseaseLayerManager.applyFilters();

    return this.getFilteredDiseases();
  }

  isSelected(diseaseId) {
    return this.selectedDiseases.has(diseaseId);
  }

  dispose() {
    this.clearSelection();
    this.selectedDiseases.clear();
  }
}
