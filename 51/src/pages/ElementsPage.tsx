import { useState, useCallback } from 'react';
import type { OpticalElement, LightSource } from '../types';
import { apiService } from '../services/api';

interface ElementsPageProps {
  elements: OpticalElement[];
  setElements: (elements: OpticalElement[]) => void;
  lightSource: LightSource;
  setLightSource: (source: LightSource) => void;
}

const elementTypes = [
  { type: 'lens', name: '透镜', defaultParams: { focal_length: 100, diameter: 25.4, refractive_index: 1.5 } },
  { type: 'mirror', name: '反射镜', defaultParams: { reflectivity: 0.95, diameter: 25.4 } },
  { type: 'beam_splitter', name: '分光镜', defaultParams: { split_ratio: 0.5, reflectivity: 0.5 } },
  { type: 'aperture', name: '光阑', defaultParams: { radius: 5.0, shape: 'circular' } },
  { type: 'grating', name: '光栅', defaultParams: { lines_per_mm: 300, order: 1 } },
  { type: 'prism', name: '棱镜', defaultParams: { apex_angle: 60, refractive_index: 1.5 } },
  { type: 'filter', name: '滤光片', defaultParams: { center_wavelength: 632.8, bandwidth: 10 } },
  { type: 'waveplate', name: '波片', defaultParams: { type: 'quarter', wavelength: 632.8 } },
  { type: 'detector', name: '探测器', defaultParams: { resolution: 1024, sensitivity: 1.0 } },
];

function ElementsPage({ elements, setElements, lightSource, setLightSource }: ElementsPageProps) {
  const [activeTab, setActiveTab] = useState('elements');
  const [isDragging, setIsDragging] = useState(false);
  const [editingElement, setEditingElement] = useState<OpticalElement | null>(null);

  const addElement = (typeInfo: typeof elementTypes[0]) => {
    const newElement: OpticalElement = {
      id: `${typeInfo.type}_${Date.now()}`,
      type: typeInfo.type,
      position: { x: 100 + elements.length * 50, y: 0, z: 0 },
      parameters: { ...typeInfo.defaultParams },
    };
    setElements([...elements, newElement]);
    setEditingElement(newElement);
  };

  const removeElement = (id: string) => {
    setElements(elements.filter((e) => e.id !== id));
    if (editingElement?.id === id) {
      setEditingElement(null);
    }
  };

  const updateElement = (id: string, updates: Partial<OpticalElement>) => {
    setElements(
      elements.map((e) => {
        if (e.id === id) {
          const updated = { ...e, ...updates };
          if (editingElement?.id === id) {
            setEditingElement(updated);
          }
          return updated;
        }
        return e;
      })
    );
  };

  const handleFileDrop = useCallback(
    async (e: React.DragEvent) => {
      e.preventDefault();
      setIsDragging(false);

      const files = e.dataTransfer.files;
      if (files.length > 0) {
        const file = files[0];
        try {
          const result = await apiService.uploadParameters(file);
          if (result.elements) {
            setElements(result.elements);
          }
          if (result.light_source) {
            setLightSource(result.light_source);
          }
        } catch (error) {
          console.error('文件解析失败:', error);
        }
      }
    },
    [setElements, setLightSource]
  );

  const loadTemplate = async (templateName: string) => {
    try {
      const template = await apiService.getTemplate(templateName);
      if (template.elements) {
        setElements(template.elements);
      }
      if (template.light_source) {
        setLightSource(template.light_source);
      }
    } catch (error) {
      console.error('加载模板失败:', error);
    }
  };

  return (
    <div>
      <h1 className="page-title">元件管理</h1>

      <div className="tabs">
        <div
          className={`tab ${activeTab === 'elements' ? 'active' : ''}`}
          onClick={() => setActiveTab('elements')}
        >
          元件列表
        </div>
        <div
          className={`tab ${activeTab === 'light' ? 'active' : ''}`}
          onClick={() => setActiveTab('light')}
        >
          光源设置
        </div>
        <div
          className={`tab ${activeTab === 'import' ? 'active' : ''}`}
          onClick={() => setActiveTab('import')}
        >
          导入/导出
        </div>
      </div>

      {activeTab === 'elements' && (
        <div>
          <div className="card">
            <div className="card-header">
              <h2 className="card-title">添加光学元件</h2>
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
              {elementTypes.map((type) => (
                <button
                  key={type.type}
                  className="btn btn-secondary"
                  onClick={() => addElement(type)}
                >
                  + {type.name}
                </button>
              ))}
            </div>
          </div>

          <div className="card">
            <div className="card-header">
              <h2 className="card-title">已配置元件 ({elements.length})</h2>
              <div style={{ display: 'flex', gap: '0.5rem' }}>
                <button
                  className="btn btn-secondary"
                  onClick={() => loadTemplate('michelson')}
                >
                  加载迈克尔逊模板
                </button>
                <button
                  className="btn btn-secondary"
                  onClick={() => loadTemplate('mach_zehnder')}
                >
                  加载马赫-曾德尔模板
                </button>
              </div>
            </div>

            {elements.length === 0 ? (
              <div className="text-center text-muted py-3">
                暂无元件，请点击上方按钮添加或加载模板
              </div>
            ) : (
              <div className="element-list">
                {elements.map((element) => {
                  const typeInfo = elementTypes.find((t) => t.type === element.type);
                  return (
                    <div key={element.id} className="element-item">
                      <div className="element-info">
                        <div className="element-name">
                          {typeInfo?.name || element.type} - {element.id}
                        </div>
                        <div className="element-type">
                          位置: ({element.position.x.toFixed(1)}, {element.position.y.toFixed(1)},{' '}
                          {element.position.z.toFixed(1)})
                        </div>
                      </div>
                      <div className="element-actions">
                        <button
                          className="icon-btn"
                          onClick={() =>
                            setEditingElement(editingElement?.id === element.id ? null : element)
                          }
                          title="编辑"
                        >
                          ✏️
                        </button>
                        <button
                          className="icon-btn danger"
                          onClick={() => removeElement(element.id)}
                          title="删除"
                        >
                          🗑️
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {editingElement && (
            <div className="card">
              <div className="card-header">
                <h2 className="card-title">编辑元件参数</h2>
                <button
                  className="icon-btn"
                  onClick={() => setEditingElement(null)}
                >
                  ✕
                </button>
              </div>
              <div className="grid-2">
                <div className="form-group">
                  <label className="form-label">X 位置</label>
                  <input
                    type="number"
                    className="form-input"
                    value={editingElement.position.x}
                    onChange={(e) =>
                      updateElement(editingElement.id, {
                        position: { ...editingElement.position, x: parseFloat(e.target.value) || 0 },
                      })
                    }
                  />
                </div>
                <div className="form-group">
                  <label className="form-label">Y 位置</label>
                  <input
                    type="number"
                    className="form-input"
                    value={editingElement.position.y}
                    onChange={(e) =>
                      updateElement(editingElement.id, {
                        position: { ...editingElement.position, y: parseFloat(e.target.value) || 0 },
                      })
                    }
                  />
                </div>
                {Object.entries(editingElement.parameters).map(([key, value]) => (
                  <div key={key} className="form-group">
                    <label className="form-label">{key}</label>
                    <input
                      type="text"
                      className="form-input"
                      value={String(value)}
                      onChange={(e) =>
                        updateElement(editingElement.id, {
                          parameters: {
                            ...editingElement.parameters,
                            [key]: parseFloat(e.target.value) || e.target.value,
                          },
                        })
                      }
                    />
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {activeTab === 'light' && (
        <div className="card">
          <div className="card-header">
            <h2 className="card-title">光源参数设置</h2>
          </div>
          <div className="grid-2">
            <div className="form-group">
              <label className="form-label">波长 (nm)</label>
              <input
                type="number"
                className="form-input"
                value={lightSource.wavelength}
                onChange={(e) =>
                  setLightSource({ ...lightSource, wavelength: parseFloat(e.target.value) || 0 })
                }
              />
            </div>
            <div className="form-group">
              <label className="form-label">功率 (mW)</label>
              <input
                type="number"
                className="form-input"
                value={lightSource.power}
                onChange={(e) =>
                  setLightSource({ ...lightSource, power: parseFloat(e.target.value) || 0 })
                }
              />
            </div>
            <div className="form-group">
              <label className="form-label">光束直径 (mm)</label>
              <input
                type="number"
                className="form-input"
                value={lightSource.beam_diameter}
                onChange={(e) =>
                  setLightSource({ ...lightSource, beam_diameter: parseFloat(e.target.value) || 0 })
                }
              />
            </div>
            <div className="form-group">
              <label className="form-label">X 位置</label>
              <input
                type="number"
                className="form-input"
                value={lightSource.position.x}
                onChange={(e) =>
                  setLightSource({
                    ...lightSource,
                    position: { ...lightSource.position, x: parseFloat(e.target.value) || 0 },
                  })
                }
              />
            </div>
          </div>
        </div>
      )}

      {activeTab === 'import' && (
        <div>
          <div className="card">
            <div className="card-header">
              <h2 className="card-title">导入参数文件</h2>
            </div>
            <div
              className={`drop-zone ${isDragging ? 'dragover' : ''}`}
              onDragOver={(e) => {
                e.preventDefault();
                setIsDragging(true);
              }}
              onDragLeave={() => setIsDragging(false)}
              onDrop={handleFileDrop}
            >
              <div className="drop-zone-icon">📁</div>
              <div className="drop-zone-text">拖放文件到此处或点击上传</div>
              <div className="drop-zone-hint">支持 JSON、YAML、XML、CSV 格式</div>
            </div>
          </div>

          <div className="card">
            <div className="card-header">
              <h2 className="card-title">导出配置</h2>
            </div>
            <button
              className="btn btn-primary"
              onClick={() => {
                const data = {
                  elements,
                  light_source: lightSource,
                  metadata: { name: '光路配置', exported_at: new Date().toISOString() },
                };
                const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = 'optical_config.json';
                a.click();
                URL.revokeObjectURL(url);
              }}
            >
              导出为 JSON
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export default ElementsPage;
