import { User, UserRole } from '../models/User.model';
import { sequelize } from '../config/database';
import { logger } from '../utils/logger';

const seedDatabase = async () => {
  try {
    await sequelize.sync({ force: true });
    logger.info('数据库表已创建');

    const admin = await User.create({
      username: 'admin',
      email: 'admin@marine.com',
      password: 'admin123',
      fullName: '系统管理员',
      role: UserRole.ADMIN,
      phone: '13800138000',
      department: '信息中心',
      isActive: true
    });
    logger.info('管理员用户已创建');

    const curator = await User.create({
      username: 'curator',
      email: 'curator@marine.com',
      password: 'curator123',
      fullName: '标本策展人',
      role: UserRole.CURATOR,
      phone: '13800138001',
      department: '标本馆',
      isActive: true
    });
    logger.info('策展人用户已创建');

    const researcher = await User.create({
      username: 'researcher',
      email: 'researcher@marine.com',
      password: 'research123',
      fullName: '研究员',
      role: UserRole.RESEARCHER,
      phone: '13800138002',
      department: '海洋研究所',
      isActive: true
    });
    logger.info('研究员用户已创建');

    logger.info('数据库初始化完成');
    logger.info('默认账号: admin / admin123');
    process.exit(0);
  } catch (error) {
    logger.error('数据库初始化失败:', error);
    process.exit(1);
  }
};

seedDatabase();
