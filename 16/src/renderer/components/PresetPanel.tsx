import { PresetTemplate } from '@shared/api';

interface PresetPanelProps {
  presets: PresetTemplate[];
  disabled: boolean;
  onApply: (presetId: string) => void;
  onCreateNew: () => void;
}

export default function PresetPanel({ presets, disabled, onApply, onCreateNew }: PresetPanelProps) {
  const systemPresets = presets.filter((p) => p.isSystem);
  const customPresets = presets.filter((p) => !p.isSystem);

  if (presets.length === 0) {
    return (
      <div className="empty-presets">
        <div className="empty-presets-icon">📋</div>
        <h3>暂无预设模板</h3>
        <p>点击下方按钮创建第一个预设</p>
        <button
          className="btn btn-primary"
          style={{ marginTop: '20px' }}
          onClick={onCreateNew}
          disabled={disabled}
        >
          + 创建预设
        </button>
      </div>
    );
  }

  return (
    <div>
      <div className="section-header">
        <div className="preset-header">
          <h3 className="section-title">✨ 系统预设</h3>
          <button
            className="btn btn-primary"
            onClick={onCreateNew}
            disabled={disabled}
          >
            + 保存当前配置为预设
          </button>
        </div>
      </div>

      <div className="preset-grid">
        {systemPresets.map((preset) => (
          <div
            key={preset.id}
            className="preset-card system"
            onClick={() => !disabled && onApply(preset.id)}
          >
            <div className="preset-icon">{preset.icon}</div>
            <div className="preset-name">{preset.name}</div>
            <div className="preset-desc">{preset.description}</div>
            <div className="preset-badge">
              系统预设 • {preset.parameters.length} 参数
            </div>
          </div>
        ))}
      </div>

      {customPresets.length > 0 && (
        <>
          <div className="section-header" style={{ marginTop: '32px' }}>
            <h3 className="section-title">💾 自定义预设</h3>
          </div>
          <div className="preset-grid">
            {customPresets.map((preset) => (
              <div
                key={preset.id}
                className="preset-card custom"
                onClick={() => !disabled && onApply(preset.id)}
              >
                <div className="preset-icon">{preset.icon}</div>
                <div className="preset-name">{preset.name}</div>
                <div className="preset-desc">{preset.description}</div>
                <div className="preset-badge">
                  自定义 • {preset.parameters.length} 参数
                </div>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
