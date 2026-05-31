import React, { useState, useCallback, memo, useMemo } from 'react';
import { Tag } from '@shared/types';
import { Plus, X, Search } from 'lucide-react';

interface TagSelectorProps {
  availableTags: Tag[];
  selectedTagIds: string[];
  onAddTag: (tagId: string) => void;
  onRemoveTag: (tagId: string) => void;
  onCreateTag?: (tag: Partial<Tag>) => Promise<void>;
  disabled?: boolean;
}

const TagSelector: React.FC<TagSelectorProps> = memo(({
  availableTags,
  selectedTagIds,
  onAddTag,
  onRemoveTag,
  onCreateTag,
  disabled = false
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [newTag, setNewTag] = useState({ name: '', color: '#3b82f6', category: '' });

  const filteredTags = useMemo(() => {
    if (!searchQuery) return availableTags;
    const query = searchQuery.toLowerCase();
    return availableTags.filter(
      tag => tag.name.toLowerCase().includes(query) || tag.category.toLowerCase().includes(query)
    );
  }, [availableTags, searchQuery]);

  const selectedTags = useMemo(() => {
    return availableTags.filter(tag => selectedTagIds.includes(tag.id));
  }, [availableTags, selectedTagIds]);

  const handleAddTag = useCallback((tagId: string) => {
    if (!selectedTagIds.includes(tagId)) {
      onAddTag(tagId);
    }
  }, [selectedTagIds, onAddTag]);

  const handleCreateTag = useCallback(async () => {
    if (!newTag.name.trim()) return;
    
    if (onCreateTag) {
      await onCreateTag(newTag);
      setNewTag({ name: '', color: '#3b82f6', category: '' });
      setShowCreateForm(false);
    }
  }, [newTag, onCreateTag]);

  const tagColors: Record<string, string> = {};

  return (
    <div className="space-y-3">
      {selectedTags.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {selectedTags.map(tag => (
            <span
              key={tag.id}
              className="inline-flex items-center px-3 py-1 rounded-full text-sm font-medium text-white"
              style={{ backgroundColor: tag.color }}
            >
              {tag.name}
              {!disabled && (
                <button
                  onClick={() => onRemoveTag(tag.id)}
                  className="ml-2 hover:bg-black/20 rounded-full p-0.5 transition-colors"
                >
                  <X size={12} />
                </button>
              )}
            </span>
          ))}
        </div>
      )}

      {!disabled && (
        <div className="space-y-2">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={16} />
            <input
              type="text"
              placeholder="搜索标签..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-9 pr-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          {filteredTags.length > 0 && (
            <div className="flex flex-wrap gap-2 max-h-32 overflow-y-auto">
              {filteredTags
                .filter(tag => !selectedTagIds.includes(tag.id))
                .map(tag => (
                  <button
                    key={tag.id}
                    onClick={() => handleAddTag(tag.id)}
                    className="px-3 py-1 rounded-full text-sm font-medium border border-gray-300 hover:border-gray-400 transition-colors"
                    style={{ color: tag.color, borderColor: tag.color + '50' }}
                  >
                    + {tag.name}
                  </button>
                ))}
            </div>
          )}

          {onCreateTag && (
            <div>
              {showCreateForm ? (
                <div className="p-3 bg-gray-50 rounded-lg space-y-2">
                  <div className="flex gap-2">
                    <input
                      type="text"
                      placeholder="标签名称"
                      value={newTag.name}
                      onChange={(e) => setNewTag({ ...newTag, name: e.target.value })}
                      className="flex-1 px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                    <input
                      type="color"
                      value={newTag.color}
                      onChange={(e) => setNewTag({ ...newTag, color: e.target.value })}
                      className="w-10 h-10 border border-gray-300 rounded-lg cursor-pointer"
                    />
                  </div>
                  <input
                    type="text"
                    placeholder="分类（如：保护等级）"
                    value={newTag.category}
                    onChange={(e) => setNewTag({ ...newTag, category: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                  <div className="flex gap-2">
                    <button
                      onClick={handleCreateTag}
                      className="px-4 py-2 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-700 transition-colors"
                    >
                      创建
                    </button>
                    <button
                      onClick={() => setShowCreateForm(false)}
                      className="px-4 py-2 bg-gray-200 text-gray-700 text-sm rounded-lg hover:bg-gray-300 transition-colors"
                    >
                      取消
                    </button>
                  </div>
                </div>
              ) : (
                <button
                  onClick={() => setShowCreateForm(true)}
                  className="flex items-center gap-1 text-sm text-blue-600 hover:text-blue-700"
                >
                  <Plus size={16} />
                  创建新标签
                </button>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
});

TagSelector.displayName = 'TagSelector';

export default TagSelector;
