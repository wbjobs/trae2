const db = require('../config/database');
const models = require('../models');
const bcrypt = require('bcryptjs');

async function initDatabase() {
  try {
    await db.authenticate();
    console.log('数据库连接成功');

    const hashedPassword = await bcrypt.hash('123456', 10);

    await models.User.bulkCreate([
      { id: 1, username: 'admin', password: hashedPassword, realName: '系统管理员', phone: '13800138000', idCard: '110101199001011234', role: 'admin', verified: true, verifyStatus: 'approved' },
      { id: 2, username: 'artisan1', password: hashedPassword, realName: '张师傅', phone: '13800138001', idCard: '110101198501012345', role: 'artisan', verified: true, verifyStatus: 'approved' },
      { id: 3, username: 'artisan2', password: hashedPassword, realName: '李大师', phone: '13800138002', idCard: '110101197805153456', role: 'artisan', verified: true, verifyStatus: 'approved' },
      { id: 4, username: 'inspector1', password: hashedPassword, realName: '王检查员', phone: '13800138003', idCard: '110101199203204567', role: 'inspector', verified: true, verifyStatus: 'approved' },
      { id: 5, username: 'viewer1', password: hashedPassword, realName: '陈观看', phone: '13800138004', idCard: '110101199512105678', role: 'viewer', verified: false, verifyStatus: 'pending' }
    ]);
    console.log('用户数据初始化成功');

    await models.Material.bulkCreate([
      { id: 1, materialNo: 'MAT20240001', name: '天然朱砂', category: '颜料', specification: '特级200目', unit: '克', quantity: 5000, unitPrice: 85, totalValue: 425000, origin: '贵州铜仁', supplier: '贵州朱砂矿业有限公司', purchaseDate: '2024-01-15', batchNo: 'ZS202401001', qualityLevel: '特级', storageLocation: 'A-01-01', status: 'in_stock', description: '天然朱砂，色泽鲜艳，纯度高', receivedBy: 1, hash: 'mat1' },
      { id: 2, materialNo: 'MAT20240002', name: '天然大漆', category: '涂料', specification: '一级生漆', unit: '千克', quantity: 200, unitPrice: 320, totalValue: 64000, origin: '陕西平利', supplier: '平利大漆专业合作社', purchaseDate: '2024-02-20', batchNo: 'DQ202402001', qualityLevel: '一级', storageLocation: 'B-02-03', status: 'in_stock', description: '优质天然生漆，漆膜坚韧光亮', receivedBy: 1, hash: 'mat2' },
      { id: 3, materialNo: 'MAT20240003', name: '紫檀木', category: '木材', specification: '50x30x10cm', unit: '块', quantity: 50, unitPrice: 2800, totalValue: 140000, origin: '印度', supplier: '南亚木材贸易公司', purchaseDate: '2024-01-28', batchNo: 'ZT202401001', qualityLevel: 'AAA', storageLocation: 'C-01-01', status: 'in_stock', description: '印度小叶紫檀，密度高，纹理美观', receivedBy: 1, hash: 'mat3' },
      { id: 4, materialNo: 'MAT20240004', name: '真金箔', category: '装饰材料', specification: '9.33x9.33cm 98金', unit: '张', quantity: 10000, unitPrice: 6.5, totalValue: 65000, origin: '南京', supplier: '南京金箔集团', purchaseDate: '2024-03-10', batchNo: 'JB202403001', qualityLevel: '98金', storageLocation: 'D-03-02', status: 'in_stock', description: '传统工艺真金箔，薄如蝉翼', receivedBy: 1, hash: 'mat4' },
      { id: 5, materialNo: 'MAT20240005', name: '天然绿松石', category: '宝石', specification: '不规则块状', unit: '克', quantity: 1200, unitPrice: 180, totalValue: 216000, origin: '湖北竹山', supplier: '竹山绿松石矿业', purchaseDate: '2024-02-28', batchNo: 'LS202402001', qualityLevel: '高瓷蓝', storageLocation: 'E-01-01', status: 'in_stock', description: '湖北竹山高瓷蓝绿松石', receivedBy: 1, hash: 'mat5' }
    ]);
    console.log('物料数据初始化成功');

    await models.Archive.bulkCreate([
      { id: 1, archiveNo: 'ARC20240001', name: '漆雕牡丹纹花瓶', category: '漆器', description: '传统脱胎漆器工艺，雕刻精美牡丹纹样，工艺精湛', craftType: '脱胎漆器', dimensions: '高35cm 口径12cm', weight: '1.2kg', materials: '天然大漆、夏布、瓦灰、金箔', creationDate: '2024-01-15', artisanId: 2, artisanName: '张师傅', images: JSON.stringify(['https://images.unsplash.com/photo-1578662996442-48f60103fc96?w=400', 'https://images.unsplash.com/photo-1565193566173-7a0ee3dbe261?w=400']), status: 'approved', currentLocation: '北京博物馆', currentHolder: '国家文物局', estimatedValue: 128000, hash: 'abc123def456' },
      { id: 2, archiveNo: 'ARC20240002', name: '紫檀木雕山水笔筒', category: '木雕', description: '选用上等印度小叶紫檀，雕刻山水人物图案，刀法细腻', craftType: '木雕', dimensions: '高15cm 直径12cm', weight: '0.8kg', materials: '印度小叶紫檀、天然蜂蜡', creationDate: '2024-02-20', artisanId: 3, artisanName: '李大师', images: JSON.stringify(['https://images.unsplash.com/photo-1558618666-fcd25c85cd64?w=400']), status: 'approved', currentLocation: '故宫博物院', currentHolder: '故宫博物院', estimatedValue: 86000, hash: 'bcd234efg567', prevHash: 'abc123def456' },
      { id: 3, archiveNo: 'ARC20240003', name: '景泰蓝缠枝莲纹瓶', category: '金属工艺', description: '铜胎掐丝珐琅工艺，缠枝莲纹样，色彩绚丽', craftType: '景泰蓝', dimensions: '高40cm 口径15cm', weight: '2.5kg', materials: '紫铜、珐琅釉料、真金箔', creationDate: '2024-03-05', artisanId: 2, artisanName: '张师傅', images: JSON.stringify(['https://images.unsplash.com/photo-1594736797933-d0501ba2fe65?w=400']), status: 'reviewing', currentLocation: '工作室', currentHolder: '张师傅', estimatedValue: 156000, hash: 'cde345fgh678', prevHash: 'bcd234efg567' },
      { id: 4, archiveNo: 'ARC20240004', name: '刺绣百鸟朝凤屏风', category: '刺绣', description: '苏绣精品，百鸟朝凤图案，针法细腻，色彩丰富', craftType: '苏绣', dimensions: '高180cm 宽240cm', weight: '15kg', materials: '真丝面料、蚕丝线、实木框架', creationDate: '2024-01-28', artisanId: 3, artisanName: '李大师', images: JSON.stringify(['https://images.unsplash.com/photo-1578301978693-85fa9c0320b9?w=400']), status: 'approved', currentLocation: '苏州博物馆', currentHolder: '苏州博物馆', estimatedValue: 280000, hash: 'def456ghi789', prevHash: 'cde345fgh678' },
      { id: 5, archiveNo: 'ARC20240005', name: '青花瓷龙纹大盘', category: '陶瓷', description: '景德镇传统青花瓷，釉下彩绘龙纹图案', craftType: '青花瓷', dimensions: '直径50cm 高8cm', weight: '3.2kg', materials: '高岭土、钴料、釉料', creationDate: '2024-02-10', artisanId: 2, artisanName: '张师傅', images: JSON.stringify(['https://images.unsplash.com/photo-1594631252845-29fc4cc8cde9?w=400']), status: 'draft', currentLocation: '工作室', currentHolder: '张师傅', estimatedValue: 68000, hash: 'efg567hij890', prevHash: 'def456ghi789' }
    ]);
    console.log('档案数据初始化成功');

    await models.CraftStep.bulkCreate([
      { id: 1, archiveId: 1, stepNo: 1, stepName: '设计制图', description: '根据客户需求设计花瓶造型和牡丹纹样图案', startTime: '2024-01-15 09:00:00', endTime: '2024-01-16 18:00:00', artisanId: 2, artisanName: '张师傅', qualityCheck: true, inspectorId: 4, inspectorName: '王检查员', inspectionResult: '设计方案通过，造型优美，纹样协调', hash: 'step1' },
      { id: 2, archiveId: 1, stepNo: 2, stepName: '制胎', description: '用夏布和瓦灰制作胎体，反复上灰打磨', startTime: '2024-01-17 09:00:00', endTime: '2024-01-25 18:00:00', artisanId: 2, artisanName: '张师傅', tools: JSON.stringify(['刮灰刀', '砂纸', '磨石']), qualityCheck: true, inspectorId: 4, inspectorName: '王检查员', inspectionResult: '胎体平整，厚薄均匀', hash: 'step2' },
      { id: 3, archiveId: 1, stepNo: 3, stepName: '髹漆', description: '反复涂刷天然大漆，每遍阴干后打磨', startTime: '2024-01-26 09:00:00', endTime: '2024-02-10 18:00:00', artisanId: 2, artisanName: '张师傅', tools: JSON.stringify(['漆刷', '荫房']), environment: '温度25°C 湿度75%', qualityCheck: true, inspectorId: 4, inspectorName: '王检查员', inspectionResult: '漆膜均匀，色泽温润', hash: 'step3' },
      { id: 4, archiveId: 1, stepNo: 4, stepName: '雕刻', description: '在漆层上雕刻牡丹纹样，层次分明', startTime: '2024-02-11 09:00:00', endTime: '2024-02-25 18:00:00', artisanId: 2, artisanName: '张师傅', tools: JSON.stringify(['雕刻刀', '针刻工具']), qualityCheck: true, inspectorId: 4, inspectorName: '王检查员', inspectionResult: '雕刻精细，层次分明，牡丹花栩栩如生', hash: 'step4' },
      { id: 5, archiveId: 1, stepNo: 5, stepName: '推光揩清', description: '用灰油反复推光，最后揩清上蜡', startTime: '2024-02-26 09:00:00', endTime: '2024-03-01 18:00:00', artisanId: 2, artisanName: '张师傅', tools: JSON.stringify(['瓦灰', '丝绸', '棉布']), qualityCheck: true, inspectorId: 4, inspectorName: '王检查员', inspectionResult: '光可鉴人，手感温润，成品合格', hash: 'step5' }
    ]);
    console.log('工序数据初始化成功');

    await models.Transfer.bulkCreate([
      { id: 1, transferNo: 'TRF20240001', archiveId: 1, archiveName: '漆雕牡丹纹花瓶', transferType: 'creation', fromParty: '原料仓库', fromPartyContact: '仓管员', fromAddress: '北京市顺义区', toParty: '张师傅工作室', toPartyContact: '张师傅', toAddress: '北京市朝阳区', transferDate: '2024-01-15 09:00:00', actualArrival: '2024-01-15 14:30:00', status: 'confirmed', handlerId: 2, handlerName: '张师傅', hash: 'trf1' },
      { id: 2, transferNo: 'TRF20240002', archiveId: 1, archiveName: '漆雕牡丹纹花瓶', transferType: 'inspection', fromParty: '张师傅工作室', toParty: '质量检验中心', transferDate: '2024-03-02 09:00:00', actualArrival: '2024-03-02 11:00:00', status: 'confirmed', handlerId: 4, handlerName: '王检查员', hash: 'trf2', prevHash: 'trf1' },
      { id: 3, transferNo: 'TRF20240003', archiveId: 1, archiveName: '漆雕牡丹纹花瓶', transferType: 'exhibition', fromParty: '质量检验中心', toParty: '北京博物馆', transferDate: '2024-03-05 10:00:00', actualArrival: '2024-03-05 15:00:00', status: 'confirmed', logisticsCompany: '顺丰速运', trackingNo: 'SF1234567890', insuranceAmount: 128000, transferFee: 500, handlerId: 1, handlerName: '系统管理员', hash: 'trf3', prevHash: 'trf2' },
      { id: 4, transferNo: 'TRF20240004', archiveId: 2, archiveName: '紫檀木雕山水笔筒', transferType: 'creation', fromParty: '木材仓库', toParty: '李大师工作室', transferDate: '2024-02-20 09:00:00', actualArrival: '2024-02-20 12:00:00', status: 'confirmed', handlerId: 3, handlerName: '李大师', hash: 'trf4' }
    ]);
    console.log('流转数据初始化成功');

    await models.MaterialUsage.bulkCreate([
      { id: 1, archiveId: 1, materialId: 2, materialName: '天然大漆', quantity: 5, unit: '千克', usageDate: '2024-01-16', usageReason: '漆雕花瓶髹漆用', usedBy: 2 },
      { id: 2, archiveId: 1, materialId: 4, materialName: '真金箔', quantity: 500, unit: '张', usageDate: '2024-02-20', usageReason: '局部贴金装饰', usedBy: 2 },
      { id: 3, archiveId: 2, materialId: 3, materialName: '紫檀木', quantity: 1, unit: '块', usageDate: '2024-02-20', usageReason: '笔筒制作原料', usedBy: 3 },
      { id: 4, archiveId: 3, materialId: 1, materialName: '天然朱砂', quantity: 100, unit: '克', usageDate: '2024-03-06', usageReason: '景泰蓝釉料调配', usedBy: 2 },
      { id: 5, archiveId: 3, materialId: 4, materialName: '真金箔', quantity: 2000, unit: '张', usageDate: '2024-03-10', usageReason: '鎏金工艺', usedBy: 2 }
    ]);
    console.log('物料使用数据初始化成功');

    await models.Signature.bulkCreate([
      { id: 1, signatureNo: 'SIG20240001', archiveId: 1, signerId: 2, signerName: '张师傅', signerRole: 'artisan', signatureType: 'artisan_confirm', signatureData: '作品创作完成确认', publicKey: '-----BEGIN PUBLIC KEY-----\nMIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEA...', certificateNo: 'CERT20240001', signedAt: '2024-03-01 10:00:00', documentHash: 'doc123', signatureValue: 'sig123', ipAddress: '192.168.1.100', location: '北京市朝阳区' },
      { id: 2, signatureNo: 'SIG20240002', archiveId: 1, signerId: 4, signerName: '王检查员', signerRole: 'inspector', signatureType: 'quality_inspection', signatureData: '质量检验合格确认', publicKey: '-----BEGIN PUBLIC KEY-----\nMIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEA...', certificateNo: 'CERT20240002', signedAt: '2024-03-02 14:00:00', documentHash: 'doc456', signatureValue: 'sig456', ipAddress: '192.168.1.101', location: '北京市海淀区' },
      { id: 3, signatureNo: 'SIG20240003', archiveId: 2, signerId: 3, signerName: '李大师', signerRole: 'artisan', signatureType: 'artisan_confirm', signatureData: '木雕作品完成确认', publicKey: '-----BEGIN PUBLIC KEY-----\nMIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEA...', certificateNo: 'CERT20240003', signedAt: '2024-02-25 16:00:00', documentHash: 'doc789', signatureValue: 'sig789', ipAddress: '192.168.1.102', location: '北京市西城区' }
    ]);
    console.log('签章数据初始化成功');

    await models.IdentityVerification.bulkCreate([
      { id: 1, verifyNo: 'VER20240001', userId: 2, realName: '张师傅', idCard: '110101198501012345', phone: '13800138001', verifyMethod: 'third_party', thirdPartyService: '阿里云实人认证', thirdPartyOrderNo: 'ALIYUN202401001', confidence: 96.5, status: 'approved', verifiedAt: '2024-01-10 14:30:00' },
      { id: 2, verifyNo: 'VER20240002', userId: 3, realName: '李大师', idCard: '110101197805153456', phone: '13800138002', verifyMethod: 'third_party', thirdPartyService: '腾讯云人脸核身', thirdPartyOrderNo: 'TENCENT202401001', confidence: 98.2, status: 'approved', verifiedAt: '2024-01-12 10:15:00' },
      { id: 3, verifyNo: 'VER20240003', userId: 4, realName: '王检查员', idCard: '110101199203204567', phone: '13800138003', verifyMethod: 'manual', status: 'approved', verifiedAt: '2024-01-08 16:00:00', verifierId: 1, verifierName: '系统管理员' },
      { id: 4, verifyNo: 'VER20240004', userId: 5, realName: '陈观看', idCard: '110101199512105678', phone: '13800138004', verifyMethod: 'third_party', thirdPartyService: '阿里云实人认证', thirdPartyOrderNo: 'ALIYUN202402001', status: 'pending' }
    ]);
    console.log('身份核验数据初始化成功');

    console.log('所有数据初始化完成！');
    console.log('\n默认账户:');
    console.log('  管理员: admin / 123456');
    console.log('  工匠: artisan1 / 123456');
    console.log('  工匠: artisan2 / 123456');
    console.log('  检查员: inspector1 / 123456');
    console.log('  浏览者: viewer1 / 123456');

    process.exit(0);
  } catch (error) {
    console.error('数据库初始化失败:', error);
    process.exit(1);
  }
}

initDatabase();
