import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Card,
  Input,
  Select,
  Button,
  Space,
  Tabs,
  Empty,
  Tag,
  Row,
  Col,
  Typography,
  AutoComplete,
  Pagination,
  Spin,
  DatePicker,
  Tooltip
} from 'antd';
import {
  SearchOutlined,
  FileImageOutlined,
  AppstoreOutlined,
  TagOutlined,
  EyeOutlined,
  ZoomInOutlined
} from '@ant-design/icons';
import { searchService, specimenService } from '../../services/specimen.service';
import { Specimen, SpecimenImage } from '../../types';
import dayjs, { Dayjs } from 'dayjs';
import ReactViewer from 'react-viewer';
import 'react-viewer/dist/index.css';

const { Title, Text } = Typography;
const { Option } = Select;
const { RangePicker } = DatePicker;

const SmartSearch: React.FC = () => {
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState<'specimen' | 'image'>('specimen');
  const [keyword, setKeyword] = useState('');
  const [suggestions, setSuggestions] = useState<any[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [loading, setLoading] = useState(false);
  const searchTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const [specimens, setSpecimens] = useState<Specimen[]>([]);
  const [images, setImages] = useState<SpecimenImage[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize] = useState(20);

  const [imageTypeFilter, setImageTypeFilter] = useState<string>('');
  const [dateRange, setDateRange] = useState<[Dayjs | null, Dayjs | null] | null>(null);
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [tagCloud, setTagCloud] = useState<{ name: string; count: number }[]>([]);

  const [viewerVisible, setViewerVisible] = useState(false);
  const [viewerIndex, setViewerIndex] = useState(0);

  useEffect(() => {
    loadTagCloud();
  }, []);

  useEffect(() => {
    if (keyword.trim()) {
      performSearch();
    }
  }, [activeTab, page, imageTypeFilter, dateRange, selectedTags]);

  const loadTagCloud = async () => {
    try {
      const result = await searchService.getTagCloud();
      setTagCloud(result.tagCloud || []);
    } catch (error) {
      console.error('加载标签云失败:', error);
    }
  };

  const debouncedSearch = useCallback((value: string) => {
    if (searchTimeoutRef.current) {
      clearTimeout(searchTimeoutRef.current);
    }

    if (value.length > 0) {
      searchTimeoutRef.current = setTimeout(async () => {
        try {
          const result = await searchService.getSearchSuggestions(value);
          setSuggestions(result.suggestions || []);
          setShowSuggestions(true);
        } catch (error) {
          setSuggestions([]);
        }
      }, 300);
    } else {
      setSuggestions([]);
      setShowSuggestions(false);
    }
  }, []);

  const performSearch = async () => {
    if (!keyword.trim()) return;

    setLoading(true);
    try {
      const params: any = {
        keyword: keyword.trim(),
        page,
        limit: pageSize
      };

      if (dateRange && dateRange[0] && dateRange[1]) {
        params.startDate = dateRange[0].format('YYYY-MM-DD');
        params.endDate = dateRange[1].format('YYYY-MM-DD');
      }

      if (selectedTags.length > 0) {
        params.tags = selectedTags.join(',');
      }

      if (activeTab === 'specimen') {
        const result = await searchService.searchSpecimens(params);
        setSpecimens(result.specimens || []);
        setTotal(result.total || 0);
      } else {
        if (imageTypeFilter) {
          params.imageType = imageTypeFilter;
        }
        const result = await searchService.searchImages(params);
        setImages(result.images || []);
        setTotal(result.total || 0);
      }
    } catch (error) {
      console.error('搜索失败:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleSearch = () => {
    setPage(1);
    setShowSuggestions(false);
    performSearch();
  };

  const handleSuggestionSelect = (value: string, option: any) => {
    setKeyword(value);
    setShowSuggestions(false);
    
    if (option.type === 'specimen') {
      navigate(`/specimens/${option.id}`);
    } else if (option.type === 'image') {
      setActiveTab('image');
      setPage(1);
      performSearch();
    } else if (option.type === 'tag') {
      if (!selectedTags.includes(value)) {
        setSelectedTags([...selectedTags, value]);
      }
      setPage(1);
    }
  };

  const handleTagClick = (tag: string) => {
    if (selectedTags.includes(tag)) {
      setSelectedTags(selectedTags.filter(t => t !== tag));
    } else {
      setSelectedTags([...selectedTags, tag]);
    }
    setPage(1);
  };

  const viewerImages = useMemo(() => 
    images.map(img => ({
      src: img.fileUrl,
      alt: img.originalName,
      downloadUrl: img.fileUrl
    })), 
  [images]);

  const openViewer = (index: number) => {
    setViewerIndex(index);
    setViewerVisible(true);
  };

  const getTagSize = (count: number) => {
    const maxCount = Math.max(...tagCloud.map(t => t.count), 1);
    const ratio = count / maxCount;
    return 12 + ratio * 12;
  };

  const searchTabs = [
    {
      key: 'specimen',
      label: (
        <span>
          <AppstoreOutlined /> 标本档案
        </span>
      )
    },
    {
      key: 'image',
      label: (
        <span>
          <FileImageOutlined /> 影像资料
        </span>
      )
    }
  ];

  return (
    <div className="smart-search-page">
      <Card className="search-header">
        <div className="search-container">
          <div className="search-input-wrapper">
            <AutoComplete
              value={keyword}
              onChange={(value) => {
                setKeyword(value);
                debouncedSearch(value);
              }}
              onSelect={handleSuggestionSelect}
              onBlur={() => setTimeout(() => setShowSuggestions(false), 200)}
              onFocus={() => keyword.trim() && setShowSuggestions(true)}
              options={suggestions.map(s => ({
                value: s.text,
                label: (
                  <div className="suggestion-item">
                    <span className="suggestion-type">
                      {s.type === 'specimen' && <AppstoreOutlined style={{ color: '#1890ff' }} />}
                      {s.type === 'image' && <FileImageOutlined style={{ color: '#52c41a' }} />}
                      {s.type === 'tag' && <TagOutlined style={{ color: '#faad14' }} />}
                    </span>
                    <span className="suggestion-text">{s.text}</span>
                    {s.subtext && <span className="suggestion-subtext">{s.subtext}</span>}
                  </div>
                )
              }))}
              style={{ width: '100%' }}
              size="large"
              placeholder="搜索标本名称、学名、标本编号、图片标签..."
              allowClear
              open={showSuggestions && suggestions.length > 0}
            />
          </div>
          <Button
            type="primary"
            size="large"
            icon={<SearchOutlined />}
            onClick={handleSearch}
            loading={loading}
          >
            搜索
          </Button>
        </div>

        <Space className="search-filters" wrap size="middle">
          <RangePicker
            value={dateRange}
            onChange={(dates) => {
              setDateRange(dates as any);
              setPage(1);
            }}
            placeholder={['开始日期', '结束日期']}
          />

          {activeTab === 'image' && (
            <Select
              placeholder="图片类型"
              allowClear
              style={{ width: 150 }}
              value={imageTypeFilter || undefined}
              onChange={(value) => {
                setImageTypeFilter(value || '');
                setPage(1);
              }}
            >
              <Option value="main">主图</Option>
              <Option value="detail">细节图</Option>
              <Option value="microscope">显微图</Option>
              <Option value="habitat">生境图</Option>
              <Option value="other">其他</Option>
            </Select>
          )}

          {selectedTags.length > 0 && (
            <Space wrap>
              {selectedTags.map(tag => (
                <Tag
                  key={tag}
                  color="blue"
                  closable
                  onClose={() => handleTagClick(tag)}
                >
                  {tag}
                </Tag>
              ))}
            </Space>
          )}
        </Space>

        {tagCloud.length > 0 && (
          <div className="tag-cloud">
            <Text type="secondary" style={{ marginRight: 8 }}>
              <TagOutlined /> 热门标签:
            </Text>
            {tagCloud.slice(0, 15).map((tag, index) => (
              <span
                key={tag.name}
                className={`tag-cloud-item ${selectedTags.includes(tag.name) ? 'active' : ''}`}
                style={{ fontSize: getTagSize(tag.count) }}
                onClick={() => handleTagClick(tag.name)}
              >
                {tag.name}
              </span>
            ))}
          </div>
        )}
      </Card>

      <Card className="search-results">
        <Tabs
          activeKey={activeTab}
          onChange={(key) => {
            setActiveTab(key as 'specimen' | 'image');
            setPage(1);
          }}
          items={searchTabs}
          tabBarExtraContent={
            keyword && (
              <Text type="secondary">
                找到 {total} 条结果
              </Text>
            )
          }
        />

        <Spin spinning={loading}>
          {!keyword.trim() ? (
            <Empty
              description={
                <div>
                  <p>请输入搜索关键词</p>
                  <Text type="secondary" style={{ fontSize: 12 }}>
                    支持搜索标本名称、学名、标本编号、图片标签等
                  </Text>
                </div>
              }
              style={{ padding: 100 }}
            />
          ) : specimens.length === 0 && images.length === 0 ? (
            <Empty
              description="未找到匹配的结果"
              style={{ padding: 100 }}
            />
          ) : activeTab === 'specimen' ? (
            <div className="specimen-results">
              <Row gutter={[16, 16]}>
                {specimens.map(specimen => (
                  <Col xs={24} sm={12} md={8} lg={6} key={specimen.id}>
                    <Card
                      hoverable
                      className="specimen-card"
                      onClick={() => navigate(`/specimens/${specimen.id}`)}
                      actions={[
                        <Button type="text" icon={<EyeOutlined />}>查看详情</Button>
                      ]}
                    >
                      <Card.Meta
                        title={specimen.name}
                        description={
                          <div>
                            <div style={{ fontSize: 12, color: '#1890ff', marginBottom: 4 }}>
                              {specimen.specimenNo}
                            </div>
                            <div style={{ fontSize: 12, color: '#666', fontStyle: 'italic' }}>
                              {specimen.scientificName}
                            </div>
                            {specimen.kingdom && (
                              <Tag color="blue" style={{ marginTop: 4 }}>
                                {specimen.kingdom}
                              </Tag>
                            )}
                            {specimen.status === 'verified' && (
                              <Tag color="green" style={{ marginTop: 4 }}>已审核</Tag>
                            )}
                            {specimen.status === 'pending' && (
                              <Tag color="orange" style={{ marginTop: 4 }}>待审核</Tag>
                            )}
                          </div>
                        }
                      />
                    </Card>
                  </Col>
                ))}
              </Row>
            </div>
          ) : (
            <div className="image-results">
              <div className="image-grid">
                {images.map((image, index) => (
                  <div key={image.id} className="image-item">
                    <img
                      src={image.fileUrl}
                      alt={image.originalName}
                      loading="lazy"
                      onClick={() => openViewer(index)}
                    />
                    <div className="image-overlay">
                      <div className="image-info">
                        <div className="image-name">{image.originalName}</div>
                        <div className="image-meta">
                          {(image as any).specimen?.name && (
                            <Tag color="blue">{(image as any).specimen.name}</Tag>
                          )}
                          {image.tags && image.tags.split(',').slice(0, 2).map(tag => (
                            <Tag key={tag} color="default" size="small">{tag.trim()}</Tag>
                          ))}
                        </div>
                      </div>
                      <div className="image-actions">
                        <Tooltip title="查看大图">
                          <Button
                            type="primary"
                            shape="circle"
                            icon={<ZoomInOutlined />}
                            onClick={(e) => {
                              e.stopPropagation();
                              openViewer(index);
                            }}
                          />
                        </Tooltip>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {total > pageSize && (
            <div className="pagination-wrapper">
              <Pagination
                current={page}
                pageSize={pageSize}
                total={total}
                showSizeChanger={false}
                onChange={(p) => {
                  setPage(p);
                  window.scrollTo({ top: 0, behavior: 'smooth' });
                }}
              />
            </div>
          )}
        </Spin>
      </Card>

      {viewerImages.length > 0 && (
        <ReactViewer
          visible={viewerVisible}
          onClose={() => setViewerVisible(false)}
          images={viewerImages}
          activeIndex={viewerIndex}
          drag={true}
          zoom={true}
          rotate={true}
          downloadable={true}
          zoomSpeed={0.1}
        />
      )}

      <style>{`
        .smart-search-page .search-header {
          margin-bottom: 16px;
        }
        .search-container {
          display: flex;
          gap: 12px;
          margin-bottom: 16px;
        }
        .search-input-wrapper {
          flex: 1;
          position: relative;
        }
        .suggestion-item {
          display: flex;
          align-items: center;
          gap: 8px;
        }
        .suggestion-type {
          width: 20px;
          display: inline-flex;
          justify-content: center;
        }
        .suggestion-text {
          flex: 1;
        }
        .suggestion-subtext {
          color: #999;
          font-size: 12px;
        }
        .search-filters {
          margin-bottom: 12px;
        }
        .tag-cloud {
          display: flex;
          flex-wrap: wrap;
          align-items: center;
          gap: 8px;
          padding-top: 12px;
          border-top: 1px solid #f0f0f0;
        }
        .tag-cloud-item {
          cursor: pointer;
          color: #666;
          transition: all 0.2s;
          padding: 2px 6px;
          border-radius: 4px;
        }
        .tag-cloud-item:hover {
          background: #e6f7ff;
          color: #1890ff;
        }
        .tag-cloud-item.active {
          background: #1890ff;
          color: white;
        }
        .specimen-card {
          height: 100%;
        }
        .image-grid {
          display: grid;
          grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
          gap: 12px;
        }
        .image-item {
          position: relative;
          overflow: hidden;
          border-radius: 8px;
          aspect-ratio: 1;
          background: #f5f5f5;
        }
        .image-item img {
          width: 100%;
          height: 100%;
          object-fit: cover;
          cursor: pointer;
          transition: transform 0.3s;
        }
        .image-item:hover img {
          transform: scale(1.05);
        }
        .image-overlay {
          position: absolute;
          inset: 0;
          background: linear-gradient(to top, rgba(0,0,0,0.8), transparent 50%);
          opacity: 0;
          transition: opacity 0.3s;
          display: flex;
          flex-direction: column;
          justify-content: space-between;
          padding: 12px;
        }
        .image-item:hover .image-overlay {
          opacity: 1;
        }
        .image-info {
          color: white;
        }
        .image-name {
          font-size: 13px;
          margin-bottom: 4px;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }
        .image-actions {
          display: flex;
          justify-content: flex-end;
        }
        .pagination-wrapper {
          display: flex;
          justify-content: center;
          margin-top: 24px;
        }
      `}</style>
    </div>
  );
};

export default SmartSearch;
