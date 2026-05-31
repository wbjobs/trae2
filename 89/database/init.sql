-- 3D GIS Mapping System - Database Initialization Script
-- PostgreSQL + PostGIS

-- 创建数据库
-- CREATE DATABASE gis3d_db;
-- \c gis3d_db;

-- 启用 PostGIS 扩展
CREATE EXTENSION IF NOT EXISTS postgis;
CREATE EXTENSION IF NOT EXISTS postgis_topology;

-- 验证 PostGIS 版本
SELECT PostGIS_Version();

-- 创建矢量数据表
CREATE TABLE IF NOT EXISTS vector_data (
    id BIGSERIAL PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    type VARCHAR(50),
    geom GEOMETRY,
    srid INTEGER DEFAULT 4326,
    properties JSON,
    layer_name VARCHAR(50),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 创建空间索引
CREATE INDEX IF NOT EXISTS idx_vector_data_geom ON vector_data USING GIST(geom);
CREATE INDEX IF NOT EXISTS idx_vector_data_layer ON vector_data(layer_name);
CREATE INDEX IF NOT EXISTS idx_vector_data_type ON vector_data(type);

-- 创建标注表
CREATE TABLE IF NOT EXISTS annotations (
    id BIGSERIAL PRIMARY KEY,
    type VARCHAR(50),
    geom GEOMETRY(Point, 4326),
    label VARCHAR(200),
    properties JSON,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 创建空间索引
CREATE INDEX IF NOT EXISTS idx_annotations_geom ON annotations USING GIST(geom);
CREATE INDEX IF NOT EXISTS idx_annotations_type ON annotations(type);

-- 创建视图：获取所有图层名称
CREATE OR REPLACE VIEW v_layer_names AS
SELECT DISTINCT layer_name
FROM vector_data
WHERE layer_name IS NOT NULL;

-- 创建函数：计算两点间距离（米）
CREATE OR REPLACE FUNCTION calculate_distance(
    lon1 DOUBLE PRECISION,
    lat1 DOUBLE PRECISION,
    lon2 DOUBLE PRECISION,
    lat2 DOUBLE PRECISION
) RETURNS DOUBLE PRECISION AS $$
BEGIN
    RETURN ST_Distance(
        ST_SetSRID(ST_MakePoint(lon1, lat1), 4326)::geography,
        ST_SetSRID(ST_MakePoint(lon2, lat2), 4326)::geography
    );
END;
$$ LANGUAGE plpgsql;

-- 创建函数：计算多边形面积（平方米）
CREATE OR REPLACE FUNCTION calculate_area(geom GEOMETRY)
RETURNS DOUBLE PRECISION AS $$
BEGIN
    RETURN ST_Area(geom::geography);
END;
$$ LANGUAGE plpgsql;

-- 创建函数：坐标转换 WGS84 转 Web Mercator
CREATE OR REPLACE FUNCTION wgs84_to_mercator(geom GEOMETRY)
RETURNS GEOMETRY AS $$
BEGIN
    RETURN ST_Transform(geom, 3857);
END;
$$ LANGUAGE plpgsql;

-- 创建函数：坐标转换 Web Mercator 转 WGS84
CREATE OR REPLACE FUNCTION mercator_to_wgs84(geom GEOMETRY)
RETURNS GEOMETRY AS $$
BEGIN
    RETURN ST_Transform(geom, 4326);
END;
$$ LANGUAGE plpgsql;

-- 插入示例数据 - 点数据（北京市主要地标）
INSERT INTO vector_data (name, type, geom, srid, layer_name, properties) VALUES
('天安门广场', 'Point', ST_SetSRID(ST_MakePoint(116.397428, 39.90923), 4326), 4326, 'landmark', '{"category":"landmark","height":44.0}'),
('故宫博物院', 'Point', ST_SetSRID(ST_MakePoint(116.397029, 39.916325), 4326), 4326, 'landmark', '{"category":"tourist","area":720000.0}'),
('颐和园', 'Point', ST_SetSRID(ST_MakePoint(116.278326, 39.999309), 4326), 4326, 'landmark', '{"category":"tourist","area":2900000.0}'),
('鸟巢体育场', 'Point', ST_SetSRID(ST_MakePoint(116.396481, 39.992989), 4326), 4326, 'landmark', '{"category":"stadium","capacity":91000}'),
('水立方', 'Point', ST_SetSRID(ST_MakePoint(116.393863, 39.998546), 4326), 4326, 'landmark', '{"category":"stadium","capacity":17000}'),
('北京西站', 'Point', ST_SetSRID(ST_MakePoint(116.321476, 39.894854), 4326), 4326, 'transport', '{"category":"station","level":"major"}'),
('首都国际机场', 'Point', ST_SetSRID(ST_MakePoint(116.603129, 40.075599), 4326), 4326, 'transport', '{"category":"airport","iata":"PEK"}');

-- 插入示例数据 - 线数据（主要道路）
INSERT INTO vector_data (name, type, geom, srid, layer_name, properties) VALUES
('长安街', 'LineString', ST_SetSRID(ST_MakeLine(
    ARRAY[
        ST_MakePoint(116.300000, 39.908823),
        ST_MakePoint(116.350000, 39.908823),
        ST_MakePoint(116.400000, 39.908823),
        ST_MakePoint(116.450000, 39.908823),
        ST_MakePoint(116.500000, 39.908823)
    ]
), 4326), 4326, 'road', '{"level":"main","lanes":8,"speed_limit":70}'),
('三环路', 'LineString', ST_SetSRID(ST_MakeLine(
    ARRAY[
        ST_MakePoint(116.280000, 39.860000),
        ST_MakePoint(116.480000, 39.860000),
        ST_MakePoint(116.480000, 39.990000),
        ST_MakePoint(116.280000, 39.990000),
        ST_MakePoint(116.280000, 39.860000)
    ]
), 4326), 4326, 'road', '{"level":"ring","lanes":6,"speed_limit":80}');

-- 插入示例数据 - 多边形数据（区域）
INSERT INTO vector_data (name, type, geom, srid, layer_name, properties) VALUES
('东城区', 'Polygon', ST_SetSRID(ST_MakePolygon(ST_MakeLine(ARRAY[
    ST_MakePoint(116.380000, 39.880000),
    ST_MakePoint(116.440000, 39.880000),
    ST_MakePoint(116.440000, 39.940000),
    ST_MakePoint(116.380000, 39.940000),
    ST_MakePoint(116.380000, 39.880000)
])), 4326), 4326, 'district', '{"population":850000,"area":41.84}'),
('西城区', 'Polygon', ST_SetSRID(ST_MakePolygon(ST_MakeLine(ARRAY[
    ST_MakePoint(116.320000, 39.870000),
    ST_MakePoint(116.380000, 39.870000),
    ST_MakePoint(116.380000, 39.940000),
    ST_MakePoint(116.320000, 39.940000),
    ST_MakePoint(116.320000, 39.870000)
])), 4326), 4326, 'district', '{"population":1100000,"area":50.53}'),
('海淀区', 'Polygon', ST_SetSRID(ST_MakePolygon(ST_MakeLine(ARRAY[
    ST_MakePoint(116.200000, 39.900000),
    ST_MakePoint(116.350000, 39.900000),
    ST_MakePoint(116.350000, 40.100000),
    ST_MakePoint(116.200000, 40.100000),
    ST_MakePoint(116.200000, 39.900000)
])), 4326), 4326, 'district', '{"population":3200000,"area":430.77}'),
('朝阳区', 'Polygon', ST_SetSRID(ST_MakePolygon(ST_MakeLine(ARRAY[
    ST_MakePoint(116.420000, 39.800000),
    ST_MakePoint(116.600000, 39.800000),
    ST_MakePoint(116.600000, 40.050000),
    ST_MakePoint(116.420000, 40.050000),
    ST_MakePoint(116.420000, 39.800000)
])), 4326), 4326, 'district', '{"population":3400000,"area":470.8}');

-- 插入示例标注数据
INSERT INTO annotations (type, geom, label, properties) VALUES
('point', ST_SetSRID(ST_MakePoint(116.397428, 39.90923), 4326), '测量点A', '{"elevation":44.5,"accuracy":0.5}'),
('point', ST_SetSRID(ST_MakePoint(116.398428, 39.91023), 4326), '测量点B', '{"elevation":45.2,"accuracy":0.3}'),
('point', ST_SetSRID(ST_MakePoint(116.396428, 39.90823), 4326), '测量点C', '{"elevation":43.8,"accuracy":0.4}');

-- 验证数据
SELECT 'Vector data count: ' || COUNT(*) FROM vector_data;
SELECT 'Annotation count: ' || COUNT(*) FROM annotations;
SELECT 'Layers: ' || string_agg(layer_name, ', ') FROM v_layer_names;

-- 空间查询示例：查询天安门周边5公里内的地标
SELECT name, type, layer_name,
       ST_Distance(geom::geography, ST_SetSRID(ST_MakePoint(116.397428, 39.90923), 4326)::geography) as distance_m
FROM vector_data
WHERE layer_name = 'landmark'
  AND ST_DWithin(geom::geography, ST_SetSRID(ST_MakePoint(116.397428, 39.90923), 4326)::geography, 5000)
ORDER BY distance_m;
