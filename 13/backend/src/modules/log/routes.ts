import { Request, Response, Router } from 'express';
import { DataStore } from '../../utils/dataStore';
import { ApiResponse, OperationLog } from '../../../shared/types';
import { AuthRequest, authenticateToken, authorizeRoles } from '../../common/middleware/auth';
import { paginate } from '../../utils/helpers';

const router = Router();
const store = DataStore.getInstance();

router.get('/', authenticateToken, authorizeRoles('admin'), (req: AuthRequest, res: Response<ApiResponse>) => {
  try {
    const page = parseInt(req.query.page as string || '1');
    const pageSize = parseInt(req.query.pageSize as string || '20');
    const action = req.query.action as string;
    const resourceType = req.query.resourceType as string;
    const userId = req.query.userId as string;
    const startDate = req.query.startDate as string;
    const endDate = req.query.endDate as string;

    let logs = [...store.operationLogs];

    if (action) {
      logs = logs.filter(l => l.action === action);
    }

    if (resourceType) {
      logs = logs.filter(l => l.resourceType === resourceType);
    }

    if (userId) {
      logs = logs.filter(l => l.userId === userId);
    }

    if (startDate) {
      const start = new Date(startDate);
      logs = logs.filter(l => l.createdAt >= start);
    }

    if (endDate) {
      const end = new Date(endDate);
      end.setHours(23, 59, 59, 999);
      logs = logs.filter(l => l.createdAt <= end);
    }

    logs.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());

    const total = logs.length;
    const start = (page - 1) * pageSize;
    const paginatedLogs = logs.slice(start, start + pageSize).map(log => ({
      ...log,
      user: log.userId ? store.users.get(log.userId) : null
    }));

    res.json({
      success: true,
      data: paginatedLogs,
      pagination: paginate(total, page, pageSize)
    });
  } catch (error) {
    res.status(500).json({ success: false, message: '获取操作日志失败' });
  }
});

router.get('/actions', authenticateToken, authorizeRoles('admin'), (req: AuthRequest, res: Response<ApiResponse>) => {
  try {
    const actions = Array.from(new Set(store.operationLogs.map(l => l.action)));
    res.json({ success: true, data: actions });
  } catch (error) {
    res.status(500).json({ success: false, message: '获取操作类型失败' });
  }
});

router.get('/stats', authenticateToken, authorizeRoles('admin'), (req: AuthRequest, res: Response<ApiResponse>) => {
  try {
    const logs = store.operationLogs;
    const now = new Date();
    const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

    const stats = {
      total: logs.length,
      today: logs.filter(l => {
        const d = l.createdAt;
        return d.getDate() === now.getDate() && d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
      }).length,
      thisWeek: logs.filter(l => l.createdAt >= weekAgo).length,
      byAction: logs.reduce((acc: Record<string, number>, log) => {
        acc[log.action] = (acc[log.action] || 0) + 1;
        return acc;
      }, {}),
      byUser: logs.slice(-100).reduce((acc: Record<string, number>, log) => {
        const userName = log.userId ? store.users.get(log.userId)?.realName || '未知' : '系统';
        acc[userName] = (acc[userName] || 0) + 1;
        return acc;
      }, {})
    };

    res.json({ success: true, data: stats });
  } catch (error) {
    res.status(500).json({ success: false, message: '获取日志统计失败' });
  }
});

export const createOperationLog = (
  userId: string | null,
  action: string,
  resourceType?: string,
  resourceId?: string,
  details?: Record<string, any>,
  ipAddress?: string,
  userAgent?: string
): void => {
  const log: OperationLog = {
    id: `log-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
    userId,
    action,
    resourceType,
    resourceId,
    details,
    ipAddress,
    userAgent,
    createdAt: new Date()
  };

  store.operationLogs.push(log);

  if (store.operationLogs.length > 10000) {
    store.operationLogs = store.operationLogs.slice(-5000);
  }
};

export default router;
