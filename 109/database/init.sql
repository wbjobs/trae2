-- ============================================
-- 矿山地形3D重构标注系统 - PostGIS数据库初始化脚本
-- ============================================

-- 创建数据库
-- CREATE DATABASE mine_terrain;

-- 连接到数据库后执行以下命令

-- 启用PostGIS扩展
CREATE EXTENSION IF NOT EXISTS postgis;
CREATE EXTENSION IF NOT EXISTS postgis_topology;

-- 验证PostGIS版本
SELECT PostGIS_version();

-- ============================================
-- 创建点云数据表
-- ============================================
DROP TABLE IF EXISTS point_cloud_data CASCADE;

CREATE TABLE point_cloud_data (
    id BIGSERIAL PRIMARY KEY,
    mine_id VARCHAR(64) NOT NULL,
    x DOUBLE PRECISION NOT NULL,
    y DOUBLE PRECISION NOT NULL,
    z DOUBLE PRECISION NOT NULL,
    location GEOMETRY(PointZ, 4326),
    intensity DOUBLE PRECISION,
    r INTEGER,
    g INTEGER,
    b INTEGER,
    classification VARCHAR(64),
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- 创建空间索引
CREATE INDEX idx_point_cloud_location ON point_cloud_data USING GIST(location);
CREATE INDEX idx_point_cloud_mine_id ON point_cloud_data(mine_id);

-- ============================================
-- 创建开采区域表
-- ============================================
DROP TABLE IF EXISTS mining_area CASCADE;

CREATE TABLE mining_area (
    id BIGSERIAL PRIMARY KEY,
    mine_id VARCHAR(64) NOT NULL,
    name VARCHAR(128) NOT NULL,
    description VARCHAR(1000),
    geometry GEOMETRY(PolygonZ, 4326),
    area DOUBLE PRECISION NOT NULL,
    status VARCHAR(32) DEFAULT 'active',
    operator VARCHAR(64),
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- 创建空间索引
CREATE INDEX idx_mining_area_geom ON mining_area USING GIST(geometry);
CREATE INDEX idx_mining_area_mine_id ON mining_area(mine_id);
CREATE INDEX idx_mining_area_status ON mining_area(status);

-- ============================================
-- 创建矿区信息表
-- ============================================
DROP TABLE IF EXISTS mine_info CASCADE;

CREATE TABLE mine_info (
    id VARCHAR(64) PRIMARY KEY,
    name VARCHAR(128) NOT NULL,
    description VARCHAR(1000),
    location GEOMETRY(Point, 4326),
    bounds GEOMETRY(Polygon, 4326),
    status VARCHAR(32) DEFAULT 'active',
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- ============================================
-- 插入示例数据 - 矿区信息
-- ============================================
INSERT INTO mine_info (id, name, description, location, status) VALUES
(
    'mine_001',
    '西山矿区',
    '西山煤矿主要开采区域',
    ST_SetSRID(ST_MakePoint(116.4074, 39.9042), 4326),
    'active'
),
(
    'mine_002',
    '东山矿区',
    '东山铁矿开采区域',
    ST_SetSRID(ST_MakePoint(116.4174, 39.9142), 4326),
    'active'
);

-- ============================================
-- 插入示例数据 - 点云数据 (简化示例)
-- ============================================
-- 生成示例点云数据 (1000个点)
INSERT INTO point_cloud_data (mine_id, x, y, z, location, intensity, r, g, b, classification)
SELECT
    'mine_001',
    ST_X(point) as x,
    ST_Y(point) as y,
    random() * 50 as z,
    ST_Force3D(point) as location,
    random() * 255 as intensity,
    (random() * 255)::integer as r,
    (random() * 255)::integer as g,
    (random() * 255)::integer as b,
    'ground' as classification
FROM (
    SELECT 
        ST_SetSRID(
            ST_MakePoint(
                116.4074 + (random() - 0.5) * 0.01,
                39.9042 + (random() - 0.5) * 0.01
            ),
            4326
        ) as point
    FROM generate_series(1, 1000)
) t;

-- ============================================
-- 插入示例数据 - 开采区域
-- ============================================
INSERT INTO mining_area (mine_id, name, description, geometry, area, status, operator)
VALUES (
    'mine_001',
    '北矿区开采面',
    '北部主要开采区域，已探明储量500万吨',
    ST_SetSRID(
        ST_MakePolygon(
            ST_MakeLine(ARRAY[
                ST_MakePoint(116.4064, 39.9032, 25),
                ST_MakePoint(116.4084, 39.9032, 28),
                ST_MakePoint(116.4084, 39.9052, 30),
                ST_MakePoint(116.4064, 39.9052, 27),
                ST_MakePoint(116.4064, 39.9032, 25)
            ])
        ),
        4326
    ),
    1250.5,
    'active',
    '张三'
),
(
    'mine_001',
    '南矿区开采面',
    '南部辅助开采区域',
    ST_SetSRID(
        ST_MakePolygon(
            ST_MakeLine(ARRAY[
                ST_MakePoint(116.4054, 39.9012, 20),
                ST_MakePoint(116.4074, 39.9012, 22),
                ST_MakePoint(116.4074, 39.9032, 25),
                ST_MakePoint(116.4054, 39.9032, 23),
                ST_MakePoint(116.4054, 39.9012, 20)
            ])
        ),
        4326
    ),
    890.3,
    'active',
    '李四'
);

-- ============================================
-- 创建视图 - 统计信息
-- ============================================
DROP VIEW IF EXISTS mine_statistics;

CREATE VIEW mine_statistics AS
SELECT
    m.id as mine_id,
    m.name as mine_name,
    COUNT(p.id) as point_count,
    COUNT(a.id) as area_count,
    COALESCE(SUM(a.area), 0) as total_area
FROM mine_info m
LEFT JOIN point_cloud_data p ON m.id = p.mine_id
LEFT JOIN mining_area a ON m.id = a.mine_id
GROUP BY m.id, m.name;

-- ============================================
-- 创建触发器 - 更新时间戳
-- ============================================
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_point_cloud_updated_at
    BEFORE UPDATE ON point_cloud_data
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_mining_area_updated_at
    BEFORE UPDATE ON mining_area
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_mine_info_updated_at
    BEFORE UPDATE ON mine_info
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- ============================================
-- 空间查询示例
-- ============================================

-- 查询某个矿区范围内的点云数据
-- SELECT * FROM point_cloud_data 
-- WHERE mine_id = 'mine_001' 
-- AND ST_DWithin(location, ST_SetSRID(ST_MakePoint(116.4074, 39.9042), 4326), 0.005);

-- 查询与指定区域相交的开采区域
-- SELECT * FROM mining_area 
-- WHERE ST_Intersects(geometry, ST_SetSRID(ST_MakePoint(116.4074, 39.9042), 4326));

-- 计算两个点之间的距离（米）
-- SELECT ST_Distance(
--     ST_GeographyFromText('POINT(116.4074 39.9042)'),
--     ST_GeographyFromText('POINT(116.4084 39.9052)')
-- );

-- 计算多边形面积（平方米）
-- SELECT ST_Area(ST_GeographyFromText(ST_AsText(geometry))) 
-- FROM mining_area WHERE id = 1;

-- ============================================
-- 完成信息
-- ============================================
SELECT 'Database initialization completed!' as message;
SELECT COUNT(*) as point_cloud_count FROM point_cloud_data;
SELECT COUNT(*) as mining_area_count FROM mining_area;
SELECT COUNT(*) as mine_info_count FROM mine_info;
