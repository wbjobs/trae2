import mongoose from 'mongoose';
import dotenv from 'dotenv';
import User from './auth/user.model';
import Fossil from './fossil/fossil.model';
import Trace from './trace/trace.model';

dotenv.config();

const seedData = async () => {
  try {
    await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/fossil3d');
    console.log('数据库连接成功');

    await User.deleteMany({});
    await Fossil.deleteMany({});
    await Trace.deleteMany({});

    const admin = await User.create({
      username: 'admin',
      email: 'admin@fossil.com',
      password: 'admin123',
      role: 'admin',
      realName: '系统管理员',
      phone: '13800138000',
      department: '信息技术部'
    });

    const curator = await User.create({
      username: 'curator',
      email: 'curator@fossil.com',
      password: 'curator123',
      role: 'curator',
      realName: '张馆长',
      phone: '13800138001',
      department: '标本馆'
    });

    const researcher = await User.create({
      username: 'researcher',
      email: 'researcher@fossil.com',
      password: 'research123',
      role: 'researcher',
      realName: '李研究员',
      phone: '13800138002',
      department: '古生物研究室'
    });

    const viewer = await User.create({
      username: 'viewer',
      email: 'viewer@fossil.com',
      password: 'viewer123',
      role: 'viewer',
      realName: '王观众',
      phone: '13800138003',
      department: '游客'
    });

    console.log('用户数据创建完成');

    const fossilsData = [
      {
        specimenNo: 'DIN-2024-001',
        name: '霸王龙化石',
        scientificName: 'Tyrannosaurus Rex',
        category: 'dinosaur' as const,
        geologicalPeriod: '白垩纪晚期',
        geologicalAge: '约6800万年前',
        discoveryLocation: '美国蒙大拿州',
        discoveryDate: new Date('1990-08-12'),
        discoverer: '苏珊·亨德里克森',
        description: '保存完整的霸王龙骨架化石，是目前发现的最完整的霸王龙标本之一。',
        features: '体长约12.8米，臀高约4米，体重约8.8吨。头骨巨大，牙齿锋利呈圆锥形。',
        preservationStatus: '完整度约90%',
        dimensions: {
          length: 1280,
          width: 400,
          height: 500,
          unit: 'cm'
        },
        status: 'exhibiting' as const,
        currentLocation: '主展厅A区',
        storageCondition: '恒温恒湿环境，温度20±2℃，湿度45±5%',
        acquisitionMethod: '考古发掘',
        acquisitionDate: new Date('1990-09-01'),
        tags: ['霸王龙', '白垩纪', '肉食恐龙', '明星标本'],
        remarks: '被誉为"化石界的蒙娜丽莎"',
        modelFiles: [],
        createdBy: admin._id,
        updatedBy: admin._id
      },
      {
        specimenNo: 'DIN-2024-002',
        name: '三角龙化石',
        scientificName: 'Triceratops',
        category: 'dinosaur' as const,
        geologicalPeriod: '白垩纪晚期',
        geologicalAge: '约6600万年前',
        discoveryLocation: '美国怀俄明州',
        discoveryDate: new Date('1887-03-15'),
        discoverer: '奥塞内尔·查利斯·马什',
        description: '典型的角龙科恐龙化石，以其头部的三只角和颈盾而闻名。',
        features: '体长约9米，体重约12吨。头部有三只角，鼻角较短，眉角较长。',
        preservationStatus: '完整度约85%',
        dimensions: {
          length: 900,
          width: 300,
          height: 350,
          unit: 'cm'
        },
        status: 'stored' as const,
        currentLocation: '标本库B-012',
        storageCondition: '标准馆藏条件',
        acquisitionMethod: '考古发掘',
        acquisitionDate: new Date('1887-04-01'),
        tags: ['三角龙', '白垩纪', '植食恐龙', '角龙科'],
        modelFiles: [],
        createdBy: curator._id,
        updatedBy: curator._id
      },
      {
        specimenNo: 'PLT-2024-001',
        name: '古银杏叶片化石',
        scientificName: 'Ginkgo biloba',
        category: 'paleobotany' as const,
        geologicalPeriod: '侏罗纪中期',
        geologicalAge: '约1.6亿年前',
        discoveryLocation: '中国辽宁省',
        discoveryDate: new Date('2015-05-20'),
        discoverer: '中国古植物研究所',
        description: '保存精美的银杏叶片化石，叶片形态清晰可见。',
        features: '叶片呈扇形，叶脉清晰，边缘有波状裂片。',
        preservationStatus: '保存完好',
        dimensions: {
          length: 8,
          width: 10,
          unit: 'cm'
        },
        status: 'researching' as const,
        currentLocation: '研究室3号台',
        storageCondition: '密封保存于亚克力板中',
        acquisitionMethod: '合作研究',
        acquisitionDate: new Date('2015-06-01'),
        tags: ['银杏', '古植物', '侏罗纪', '活化石'],
        modelFiles: [],
        createdBy: researcher._id,
        updatedBy: researcher._id
      },
      {
        specimenNo: 'INV-2024-001',
        name: '三叶虫化石',
        scientificName: 'Trilobita',
        category: 'invertebrate' as const,
        geologicalPeriod: '寒武纪',
        geologicalAge: '约5.2亿年前',
        discoveryLocation: '中国云南省澄江县',
        discoveryDate: new Date('1984-07-01'),
        discoverer: '侯先光',
        description: '澄江生物群中的典型三叶虫化石，保存了软躯体结构。',
        features: '身体分为头、胸、尾三部分，背甲坚硬，分节明显。',
        preservationStatus: '化石完整，细节清晰',
        dimensions: {
          length: 15,
          width: 8,
          height: 2,
          unit: 'cm'
        },
        status: 'exhibiting' as const,
        currentLocation: '古生代展厅B区',
        storageCondition: '展示柜中密封保存',
        acquisitionMethod: '考古发掘',
        acquisitionDate: new Date('1984-08-01'),
        tags: ['三叶虫', '寒武纪', '节肢动物', '澄江生物群'],
        modelFiles: [],
        createdBy: admin._id,
        updatedBy: admin._id
      },
      {
        specimenNo: 'VRT-2024-001',
        name: '猛犸象臼齿化石',
        scientificName: 'Mammuthus primigenius',
        category: 'vertebrate' as const,
        geologicalPeriod: '更新世晚期',
        geologicalAge: '约1万年前',
        discoveryLocation: '俄罗斯西伯利亚',
        discoveryDate: new Date('2010-04-10'),
        discoverer: '当地牧民',
        description: '保存完好的猛犸象臼齿化石，磨蚀面清晰可见。',
        features: '臼齿结构复杂，釉质层厚，适合咀嚼粗糙植物。',
        preservationStatus: '完整度95%以上',
        dimensions: {
          length: 30,
          width: 15,
          height: 20,
          weight: 5,
          unit: 'kg'
        },
        status: 'stored' as const,
        currentLocation: '标本库C-003',
        storageCondition: '干燥环境保存',
        acquisitionMethod: '捐赠',
        acquisitionDate: new Date('2010-05-01'),
        tags: ['猛犸象', '更新世', '长鼻目', '冰河时期'],
        remarks: '西伯利亚永久冻土层中发现',
        modelFiles: [],
        createdBy: curator._id,
        updatedBy: curator._id
      }
    ];

    const createdFossils = await Fossil.create(fossilsData);
    console.log('化石标本数据创建完成');

    for (const fossil of createdFossils) {
      await Trace.create({
        fossilId: fossil._id,
        specimenNo: fossil.specimenNo,
        type: 'create',
        title: '标本建档',
        description: `${fossil.name} 标本信息录入系统`,
        operator: (fossil.createdBy as any)._id || admin._id,
        operatorName: '系统管理员',
        toStatus: fossil.status,
        toLocation: fossil.currentLocation
      });
    }

    const tRex = createdFossils[0];
    await Trace.create([
      {
        fossilId: tRex._id,
        specimenNo: tRex.specimenNo,
        type: 'status_change',
        title: '状态变更',
        description: '标本从库房调出，准备展览',
        operator: curator._id,
        operatorName: curator.realName,
        fromStatus: 'stored',
        toStatus: 'exhibiting',
        timestamp: new Date('2024-01-15')
      },
      {
        fossilId: tRex._id,
        specimenNo: tRex.specimenNo,
        type: 'location_change',
        title: '位置变更',
        description: '标本从标本库移至主展厅A区',
        operator: curator._id,
        operatorName: curator.realName,
        fromLocation: '标本库A-001',
        toLocation: '主展厅A区',
        timestamp: new Date('2024-01-16')
      },
      {
        fossilId: tRex._id,
        specimenNo: tRex.specimenNo,
        type: 'research',
        title: '科学研究',
        description: '古生物学研究团队对标本进行CT扫描研究',
        operator: researcher._id,
        operatorName: researcher.realName,
        metadata: {
          researchType: 'CT扫描',
          researchInstitution: '古生物研究中心',
          duration: '3天'
        },
        timestamp: new Date('2024-02-10')
      }
    ]);

    console.log('溯源记录数据创建完成');
    console.log('初始化数据完成！');
    console.log('默认账号：admin / admin123');

    await mongoose.connection.close();
  } catch (err) {
    console.error('初始化数据失败:', err);
    process.exit(1);
  }
};

seedData();
