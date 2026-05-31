import { useState, useEffect } from 'react';
import { X, Pin, Tag, AlignLeft, Palette } from 'lucide-react';
import { useGeoStore } from '@/store';
import type { Annotation } from '@/types';

interface AnnotationModalProps {
  isOpen: boolean;
  onClose: () => void;
  position?: [number, number, number];
  onSubmit?: (data: {
    name: string;
    description: string;
    type: 'pin' | 'label' | 'area';
    color: string;
  }) => void;
}

const presetColors = [
  '#e87c3e',
  '#38a169',
  '#4299e1',
  '#e53e3e',
  '#805ad5',
  '#d69e2e',
  '#319795',
  '#ed64a6',
];

const annotationTypes = [
  { value: 'pin', label: '图钉' },
  { value: 'label', label: '标签' },
  { value: 'area', label: '区域' },
] as const;

export default function AnnotationModal({ isOpen, onClose, position, onSubmit }: AnnotationModalProps) {
  const { addAnnotation, currentCoordinates } = useGeoStore();
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [color, setColor] = useState('#e87c3e');
  const [type, setType] = useState<Annotation['type']>('pin');
  const [errors, setErrors] = useState<{ name?: string }>({});

  useEffect(() => {
    if (isOpen) {
      setName('');
      setDescription('');
      setColor('#e87c3e');
      setType('pin');
      setErrors({});
    }
  }, [isOpen]);

  const handleSubmit = () => {
    const newErrors: { name?: string } = {};
    if (!name.trim()) {
      newErrors.name = '请输入标注名称';
    }
    setErrors(newErrors);
    if (Object.keys(newErrors).length > 0) return;

    if (onSubmit) {
      onSubmit({
        name: name.trim(),
        description: description.trim(),
        type,
        color,
      });
      onClose();
      return;
    }

    const pos = position || currentCoordinates || [0, 0, 0];
    const newAnnotation: Annotation = {
      id: `ann-${Date.now()}`,
      type,
      name: name.trim(),
      description: description.trim(),
      position: pos,
      color,
      createdAt: new Date().toISOString(),
    };

    addAnnotation(newAnnotation);
    onClose();
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full max-w-md bg-geo-dark border border-geo-border rounded-xl shadow-2xl overflow-hidden">
        <div className="flex items-center justify-between p-4 border-b border-geo-border bg-geo-dark-light">
          <div className="flex items-center gap-2">
            <Pin className="w-5 h-5 text-geo-orange" />
            <h3 className="font-display font-semibold text-lg text-geo-text">添加标注</h3>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg hover:bg-geo-dark text-geo-text-muted hover:text-geo-text transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-5 space-y-5">
          <div>
            <label className="flex items-center gap-2 text-sm font-medium text-geo-text mb-2">
              <Tag className="w-4 h-4 text-geo-orange" />
              标注类型
            </label>
            <div className="flex gap-2">
              {annotationTypes.map((t) => (
                <button
                  key={t.value}
                  onClick={() => setType(t.value)}
                  className={`flex-1 py-2 px-3 rounded-lg text-sm font-medium transition-all ${
                    type === t.value
                      ? 'bg-geo-orange text-white'
                      : 'bg-geo-dark-light text-geo-text-muted hover:text-geo-text hover:bg-geo-dark'
                  }`}
                >
                  {t.label}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="flex items-center gap-2 text-sm font-medium text-geo-text mb-2">
              <Tag className="w-4 h-4 text-geo-orange" />
              标注名称
              <span className="text-red-400">*</span>
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="请输入标注名称"
              className={`w-full h-10 bg-geo-dark-light border rounded-lg px-3 text-sm text-geo-text placeholder-geo-text-muted focus:outline-none transition-colors ${
                errors.name ? 'border-red-500' : 'border-geo-border focus:border-geo-orange'
              }`}
            />
            {errors.name && (
              <p className="text-xs text-red-400 mt-1">{errors.name}</p>
            )}
          </div>

          <div>
            <label className="flex items-center gap-2 text-sm font-medium text-geo-text mb-2">
              <AlignLeft className="w-4 h-4 text-geo-orange" />
              描述
            </label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="请输入描述信息（可选）"
              rows={3}
              className="w-full bg-geo-dark-light border border-geo-border rounded-lg px-3 py-2 text-sm text-geo-text placeholder-geo-text-muted focus:outline-none focus:border-geo-orange resize-none transition-colors"
            />
          </div>

          <div>
            <label className="flex items-center gap-2 text-sm font-medium text-geo-text mb-2">
              <Palette className="w-4 h-4 text-geo-orange" />
              颜色
            </label>
            <div className="flex items-center gap-3">
              <div className="flex gap-2">
                {presetColors.map((c) => (
                  <button
                    key={c}
                    onClick={() => setColor(c)}
                    className={`w-8 h-8 rounded-lg transition-all ${
                      color === c
                        ? 'ring-2 ring-white ring-offset-2 ring-offset-geo-dark scale-110'
                        : 'hover:scale-105'
                    }`}
                    style={{ backgroundColor: c }}
                  />
                ))}
              </div>
              <div className="flex items-center gap-2">
                <input
                  type="color"
                  value={color}
                  onChange={(e) => setColor(e.target.value)}
                  className="w-8 h-8 rounded-lg cursor-pointer bg-transparent border-0 p-0"
                />
                <span className="font-mono text-xs text-geo-text-muted">{color}</span>
              </div>
            </div>
          </div>

          {position && (
            <div className="bg-geo-dark-light rounded-lg p-3">
              <span className="text-xs text-geo-text-muted block mb-1">标注位置</span>
              <div className="font-mono text-sm text-geo-text">
                X: {position[0].toFixed(5)}, Y: {position[1].toFixed(5)}, Z: {position[2].toFixed(2)}m
              </div>
            </div>
          )}
        </div>

        <div className="flex items-center justify-end gap-3 p-4 border-t border-geo-border bg-geo-dark-light">
          <button
            onClick={onClose}
            className="px-5 py-2 rounded-lg text-sm font-medium text-geo-text-muted hover:text-geo-text hover:bg-geo-dark transition-colors"
          >
            取消
          </button>
          <button
            onClick={handleSubmit}
            className="px-6 py-2 bg-geo-orange hover:bg-geo-orange-hover text-white rounded-lg text-sm font-medium transition-colors shadow-lg shadow-geo-orange/20"
          >
            确认添加
          </button>
        </div>
      </div>
    </div>
  );
}
