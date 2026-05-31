import { useState } from 'react';
import Modal from './Modal';

interface CreatePresetModalProps {
  onClose: () => void;
  onCreate: (name: string, description: string) => void;
}

export default function CreatePresetModal({ onClose, onCreate }: CreatePresetModalProps) {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (name.trim()) {
      onCreate(name.trim(), description.trim());
      onClose();
    }
  };

  return (
    <Modal
      title="💾 创建新预设"
      onClose={onClose}
      footer={
        <>
          <button className="btn btn-secondary" onClick={onClose}>
            取消
          </button>
          <button
            className="btn btn-primary"
            onClick={handleSubmit}
            disabled={!name.trim()}
          >
            创建
          </button>
        </>
      }
    >
      <form onSubmit={handleSubmit}>
        <div className="form-group">
          <label className="form-label">预设名称</label>
          <input
            type="text"
            className="form-input"
            placeholder="例如：我的游戏配置"
            value={name}
            onChange={(e) => setName(e.target.value)}
            autoFocus
          />
        </div>
        <div className="form-group">
          <label className="form-label">描述（可选）</label>
          <textarea
            className="form-input form-textarea"
            placeholder="简要描述这个预设的用途..."
            value={description}
            onChange={(e) => setDescription(e.target.value)}
          />
        </div>
        <p style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '16px' }}>
          💡 将保存当前设备的所有参数配置为新预设
        </p>
      </form>
    </Modal>
  );
}
