import { getDatabase } from './models/database';
import { v4 as uuidv4 } from 'uuid';
import path from 'path';

const db = getDatabase();

function seedData() {
  console.log('开始填充种子数据...\n');

  const now = new Date().toISOString();
  const uploadDir = process.env.UPLOAD_DIR || './uploads';

  const categories = [
    { id: 'cat-1', name: '针叶树种', parent_id: null, code: 'CONIFER', description: '松柏类等针叶树种', sort_order: 1 },
    { id: 'cat-2', name: '阔叶树种', parent_id: null, code: 'BROAD', description: '阔叶树种', sort_order: 2 },
    { id: 'cat-3', name: '灌木树种', parent_id: null, code: 'SHRUB', description: '灌木类树种', sort_order: 3 },
    { id: 'cat-4', name: '松科', parent_id: 'cat-1', code: 'PINACEAE', description: '松科植物', sort_order: 1 },
    { id: 'cat-5', name: '柏科', parent_id: 'cat-1', code: 'CUPRESSACEAE', description: '柏科植物', sort_order: 2 },
    { id: 'cat-6', name: '壳斗科', parent_id: 'cat-2', code: 'FAGACEAE', description: '壳斗科植物', sort_order: 1 },
    { id: 'cat-7', name: '樟科', parent_id: 'cat-2', code: 'LAURACEAE', description: '樟科植物', sort_order: 2 },
    { id: 'cat-8', name: '国家一级保护', parent_id: null, code: 'LEVEL1', description: '国家一级保护植物', sort_order: 4 },
    { id: 'cat-9', name: '国家二级保护', parent_id: null, code: 'LEVEL2', description: '国家二级保护植物', sort_order: 5 }
  ];

  const categoryStmt = db.prepare(`
    INSERT OR IGNORE INTO categories (id, name, parent_id, code, description, sort_order, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `);

  for (const cat of categories) {
    categoryStmt.run(cat.id, cat.name, cat.parent_id, cat.code, cat.description, cat.sort_order, now, now);
  }
  console.log('✓ 分类数据已填充');

  const resources = [
    {
      id: 'res-1', name: '银杏', scientific_name: 'Ginkgo biloba',
      category_id: 'cat-8', family: '银杏科', genus: '银杏属', species: '银杏',
      description: '落叶乔木，高可达40米，胸径可达4米。叶扇形，有长柄。种子核果状，外种皮肉质，成熟时黄色。',
      origin: '中国', habitat: '海拔500-1000米的天然林中',
      protection_level: '国家一级保护',
      latitude: 31.2304, longitude: 121.4737, altitude: 50,
      address: '上海市浦东新区', province: '上海市', city: '上海市', district: '浦东新区',
      surveyor: '张调查', survey_date: '2025-03-15'
    },
    {
      id: 'res-2', name: '水杉', scientific_name: 'Metasequoia glyptostroboides',
      category_id: 'cat-8', family: '杉科', genus: '水杉属', species: '水杉',
      description: '落叶乔木，高可达35米，胸径达2.5米。叶条形，对生。球果近球形。',
      origin: '中国', habitat: '山谷或山麓附近地势平缓、土层深厚、湿润或稍有积水的地方',
      protection_level: '国家一级保护',
      latitude: 30.5928, longitude: 114.3055, altitude: 750,
      address: '湖北省利川市', province: '湖北省', city: '恩施土家族苗族自治州', district: '利川市',
      surveyor: '李调查', survey_date: '2025-04-20'
    },
    {
      id: 'res-3', name: '红豆杉', scientific_name: 'Taxus chinensis',
      category_id: 'cat-8', family: '红豆杉科', genus: '红豆杉属', species: '中国红豆杉',
      description: '常绿乔木，高可达30米，胸径达1米。叶条形，螺旋状着生。种子生于红色肉质假种皮中。',
      origin: '中国', habitat: '海拔1000-1500米的山地林中',
      protection_level: '国家一级保护',
      latitude: 27.9881, longitude: 102.6536, altitude: 1200,
      address: '云南省昆明市西山区', province: '云南省', city: '昆明市', district: '西山区',
      surveyor: '王调查', survey_date: '2025-05-10'
    },
    {
      id: 'res-4', name: '马尾松', scientific_name: 'Pinus massoniana',
      category_id: 'cat-4', family: '松科', genus: '松属', species: '马尾松',
      description: '常绿乔木，高可达45米，胸径1.5米。针叶2针一束，细柔。球果卵圆形或圆锥状卵圆形。',
      origin: '中国', habitat: '海拔1500米以下的山地',
      protection_level: null,
      latitude: 28.2282, longitude: 112.9388, altitude: 300,
      address: '湖南省长沙市岳麓区', province: '湖南省', city: '长沙市', district: '岳麓区',
      surveyor: '陈调查', survey_date: '2025-03-25'
    },
    {
      id: 'res-5', name: '樟树', scientific_name: 'Cinnamomum camphora',
      category_id: 'cat-7', family: '樟科', genus: '樟属', species: '樟树',
      description: '常绿大乔木，高可达30米，直径可达3米。叶互生，卵形或椭圆状卵形。',
      origin: '中国', habitat: '海拔1800米以下的山坡、沟谷及溪边',
      protection_level: '国家二级保护',
      latitude: 28.6820, longitude: 115.8579, altitude: 100,
      address: '江西省南昌市东湖区', province: '江西省', city: '南昌市', district: '东湖区',
      surveyor: '刘调查', survey_date: '2025-04-05'
    },
    {
      id: 'res-6', name: '青冈栎', scientific_name: 'Cyclobalanopsis glauca',
      category_id: 'cat-6', family: '壳斗科', genus: '青冈属', species: '青冈栎',
      description: '常绿乔木，高达20米。叶革质，倒卵状椭圆形或长椭圆形。',
      origin: '中国', habitat: '海拔200-2600米的山坡或沟谷林中',
      protection_level: null,
      latitude: 30.5728, longitude: 104.0668, altitude: 800,
      address: '四川省成都市都江堰市', province: '四川省', city: '成都市', district: '都江堰市',
      surveyor: '杨调查', survey_date: '2025-04-15'
    },
    {
      id: 'res-7', name: '侧柏', scientific_name: 'Platycladus orientalis',
      category_id: 'cat-5', family: '柏科', genus: '侧柏属', species: '侧柏',
      description: '常绿乔木，高可达20米，胸径1米。叶鳞形，交互对生。球果近卵圆形。',
      origin: '中国', habitat: '海拔1500米以下的山地、丘陵、平原',
      protection_level: null,
      latitude: 35.1046, longitude: 113.6654, altitude: 200,
      address: '河南省郑州市登封市', province: '河南省', city: '郑州市', district: '登封市',
      surveyor: '赵调查', survey_date: '2025-03-30'
    }
  ];

  const resourceStmt = db.prepare(`
    INSERT OR IGNORE INTO resources (
      id, name, scientific_name, category_id, family, genus, species,
      description, origin, habitat, protection_level,
      latitude, longitude, altitude, address, province, city, district,
      surveyor, survey_date, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  for (const res of resources) {
    resourceStmt.run(
      res.id, res.name, res.scientific_name, res.category_id,
      res.family, res.genus, res.species, res.description,
      res.origin, res.habitat, res.protection_level,
      res.latitude, res.longitude, res.altitude, res.address,
      res.province, res.city, res.district, res.surveyor,
      res.survey_date, now, now
    );
  }
  console.log('✓ 种质资源数据已填充');

  const growthRecords = [
    { resource_id: 'res-1', record_date: '2024-03-15', height_cm: 1200, dbh_cm: 45, crown_width_m: 8, health_status: '良好', phenology: '萌芽期', notes: '春季萌发新芽', recorder: '张监测' },
    { resource_id: 'res-1', record_date: '2024-09-15', height_cm: 1235, dbh_cm: 47, crown_width_m: 8.2, health_status: '良好', phenology: '结果期', notes: '秋季结果', recorder: '张监测' },
    { resource_id: 'res-1', record_date: '2025-03-15', height_cm: 1275, dbh_cm: 49, crown_width_m: 8.5, health_status: '良好', phenology: '展叶期', notes: '生长健康', recorder: '张监测' },
    { resource_id: 'res-2', record_date: '2024-04-20', height_cm: 1800, dbh_cm: 68, crown_width_m: 10, health_status: '良好', phenology: '展叶期', notes: '生长旺盛', recorder: '李监测' },
    { resource_id: 'res-2', record_date: '2024-10-20', height_cm: 1860, dbh_cm: 71, crown_width_m: 10.3, health_status: '良好', phenology: '落叶期', notes: '秋季落叶', recorder: '李监测' },
    { resource_id: 'res-2', record_date: '2025-04-20', height_cm: 1920, dbh_cm: 74, crown_width_m: 10.5, health_status: '优秀', phenology: '展叶期', notes: '生长优秀', recorder: '李监测' },
    { resource_id: 'res-3', record_date: '2024-05-10', height_cm: 800, dbh_cm: 25, crown_width_m: 5, health_status: '一般', phenology: '花期', notes: '需要加强保护', recorder: '王监测' },
    { resource_id: 'res-3', record_date: '2024-11-10', height_cm: 815, dbh_cm: 26, crown_width_m: 5.1, health_status: '良好', phenology: '果期', notes: '状态改善', recorder: '王监测' },
    { resource_id: 'res-3', record_date: '2025-05-10', height_cm: 835, dbh_cm: 27, crown_width_m: 5.3, health_status: '良好', phenology: '花期', notes: '生长稳定', recorder: '王监测' },
    { resource_id: 'res-4', record_date: '2024-03-25', height_cm: 1500, dbh_cm: 35, crown_width_m: 6, health_status: '良好', phenology: '开花期', notes: '正常生长', recorder: '陈监测' },
    { resource_id: 'res-4', record_date: '2024-09-25', height_cm: 1545, dbh_cm: 37, crown_width_m: 6.2, health_status: '良好', phenology: '球果成熟期', notes: '球果成熟', recorder: '陈监测' },
    { resource_id: 'res-4', record_date: '2025-03-25', height_cm: 1590, dbh_cm: 39, crown_width_m: 6.5, health_status: '良好', phenology: '开花期', notes: '持续监测', recorder: '陈监测' },
    { resource_id: 'res-5', record_date: '2024-04-05', height_cm: 1000, dbh_cm: 38, crown_width_m: 9, health_status: '优秀', phenology: '花期', notes: '生长优秀', recorder: '刘监测' },
    { resource_id: 'res-5', record_date: '2024-10-05', height_cm: 1030, dbh_cm: 40, crown_width_m: 9.2, health_status: '优秀', phenology: '果期', notes: '状态良好', recorder: '刘监测' },
    { resource_id: 'res-5', record_date: '2025-04-05', height_cm: 1065, dbh_cm: 42, crown_width_m: 9.5, health_status: '优秀', phenology: '花期', notes: '生长优秀', recorder: '刘监测' }
  ];

  const growthStmt = db.prepare(`
    INSERT OR IGNORE INTO growth_records (
      id, resource_id, record_date, height_cm, dbh_cm,
      crown_width_m, health_status, phenology, notes,
      recorder, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  for (const record of growthRecords) {
    const id = uuidv4();
    growthStmt.run(
      id, record.resource_id, record.record_date,
      record.height_cm, record.dbh_cm, record.crown_width_m,
      record.health_status, record.phenology, record.notes,
      record.recorder, now, now
    );
  }
  console.log('✓ 生长记录数据已填充');

  const fieldImages = [
    { resource_id: 'res-1', original_name: 'ginkgo_overview.jpg', file_name: 'ginkgo_001.jpg', description: '银杏整株外观', taken_date: '2025-03-15', location: '上海市浦东新区', photographer: '张摄影' },
    { resource_id: 'res-1', original_name: 'ginkgo_leaves.jpg', file_name: 'ginkgo_002.jpg', description: '银杏叶片特写', taken_date: '2025-03-15', location: '上海市浦东新区', photographer: '张摄影' },
    { resource_id: 'res-2', original_name: 'metasequoia_tree.jpg', file_name: 'meta_001.jpg', description: '水杉整株', taken_date: '2025-04-20', location: '湖北省利川市', photographer: '李摄影' },
    { resource_id: 'res-2', original_name: 'metasequoia_bark.jpg', file_name: 'meta_002.jpg', description: '水杉树皮', taken_date: '2025-04-20', location: '湖北省利川市', photographer: '李摄影' },
    { resource_id: 'res-3', original_name: 'taxus_tree.jpg', file_name: 'taxus_001.jpg', description: '红豆杉整株', taken_date: '2025-05-10', location: '云南省昆明市', photographer: '王摄影' },
    { resource_id: 'res-3', original_name: 'taxus_fruit.jpg', file_name: 'taxus_002.jpg', description: '红豆杉假种皮', taken_date: '2025-05-10', location: '云南省昆明市', photographer: '王摄影' },
    { resource_id: 'res-4', original_name: 'pinus_massoniana.jpg', file_name: 'pine_001.jpg', description: '马尾松全景', taken_date: '2025-03-25', location: '湖南省长沙市', photographer: '陈摄影' },
    { resource_id: 'res-5', original_name: 'camphor_tree.jpg', file_name: 'camphor_001.jpg', description: '樟树全景', taken_date: '2025-04-05', location: '江西省南昌市', photographer: '刘摄影' }
  ];

  const imageStmt = db.prepare(`
    INSERT OR IGNORE INTO field_images (
      id, resource_id, file_name, original_name, file_path,
      file_size, mime_type, description, taken_date,
      location, photographer, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  for (const img of fieldImages) {
    const id = uuidv4();
    imageStmt.run(
      id, img.resource_id, img.file_name, img.original_name,
      `${uploadDir}/${img.file_name}`,
      1024000 + Math.floor(Math.random() * 4000000),
      'image/jpeg',
      img.description, img.taken_date, img.location, img.photographer, now
    );
  }
  console.log('✓ 野外影像数据已填充');

  console.log('\n========================================');
  console.log('  种子数据填充完成！');
  console.log('========================================\n');
}

seedData();
