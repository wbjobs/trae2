import { ParameterDefinition, ParameterValue } from '../../shared/types';
import { useMemo } from 'react';

interface ParameterPanelProps {
  parameters: ParameterDefinition[];
  values: Map<string, ParameterValue>;
  disabled: boolean;
  onChange: (paramId: string, value: number | boolean | string) => void;
}

export default function ParameterPanel({ parameters, values, disabled, onChange }: ParameterPanelProps) {
  const groups = useMemo(() => {
    const grouped = new Map<string, ParameterDefinition[]>();
    const ungrouped: ParameterDefinition[] = [];

    for (const param of parameters) {
      const groupName = param.group || 'General';
      if (!grouped.has(groupName)) {
        grouped.set(groupName, []);
      }
      grouped.get(groupName)!.push(param);
    }

    return Array.from(grouped.entries()).map(([name, params]) => ({ name, params }));
  }, [parameters]);

  const getCurrentValue = (param: ParameterDefinition): number | boolean | string => {
    const stored = values.get(param.id);
    return stored?.value ?? param.defaultValue;
  };

  const renderControl = (param: ParameterDefinition) => {
    const value = getCurrentValue(param);

    switch (param.type) {
      case 'int':
      case 'float':
        return (
          <div className="slider-container">
            <input
              type="range"
              className="slider"
              min={param.min ?? 0}
              max={param.max ?? 100}
              step={param.step ?? 1}
              value={value as number}
              disabled={disabled}
              onChange={(e) => onChange(param.id, Number(e.target.value))}
            />
            <input
              type="number"
              className="number-input"
              min={param.min}
              max={param.max}
              step={param.step}
              value={value as number}
              disabled={disabled}
              onChange={(e) => onChange(param.id, Number(e.target.value))}
            />
            <span className="slider-value">
              {value}
              {param.unit ? ` ${param.unit}` : ''}
            </span>
          </div>
        );

      case 'bool':
        return (
          <div
            className={`toggle-switch ${value ? 'active' : ''}`}
            onClick={() => !disabled && onChange(param.id, !value)}
          >
            <div className="toggle-knob" />
          </div>
        );

      case 'enum':
        return (
          <select
            className="select-input"
            value={String(value)}
            disabled={disabled}
            onChange={(e) => {
              const opt = param.options?.find((o) => String(o.value) === e.target.value);
              if (opt) onChange(param.id, opt.value);
            }}
          >
            {param.options?.map((opt) => (
              <option key={String(opt.value)} value={String(opt.value)}>
                {opt.label}
              </option>
            ))}
          </select>
        );

      case 'string':
        return (
          <input
            type="text"
            className="number-input"
            value={value as string}
            disabled={disabled}
            onChange={(e) => onChange(param.id, e.target.value)}
          />
        );

      default:
        return <span>{String(value)}</span>;
    }
  };

  if (groups.length === 0) {
    return (
      <div className="empty-state">
        <p>该设备没有可配置的参数</p>
      </div>
    );
  }

  return (
    <>
      {groups.map((group) => (
        <div key={group.name} className="parameter-group">
          <div className="group-header">
            <h4>{group.name}</h4>
          </div>
          <div className="group-body">
            {group.params.map((param) => (
              <div key={param.id} className="parameter-row">
                <div className="parameter-label">
                  <div className="parameter-label-name">{param.name}</div>
                  {param.description && (
                    <div className="parameter-label-desc">{param.description}</div>
                  )}
                </div>
                <div className="parameter-control">{renderControl(param)}</div>
              </div>
            ))}
          </div>
        </div>
      ))}
    </>
  );
}
