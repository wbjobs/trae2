import { Request, Response, Router } from 'express';
import { DataStore } from '../../utils/dataStore';
import { ApiResponse, SpecimenVersion } from '../../../shared/types';
import { AuthRequest, authenticateToken } from '../../common/middleware/auth';
import { generateId } from '../../utils/helpers';

const router = Router();
const store = DataStore.getInstance();

router.get('/specimen/:specimenId', authenticateToken, (req: AuthRequest, res: Response<ApiResponse>) => {
  try {
    const { specimenId } = req.params;

    const specimen = store.specimens.get(specimenId);
    if (!specimen) {
      res.status(404).json({ success: false, message: '标本不存在' });
      return;
    }

    const versions = Array.from(store.specimenVersions.values())
      .filter(v => v.specimenId === specimenId)
      .sort((a, b) => b.version - a.version);

    res.json({
      success: true,
      data: versions
    });
  } catch (error) {
    res.status(500).json({ success: false, message: '获取版本历史失败' });
  }
});

router.get('/:id', authenticateToken, (req: AuthRequest, res: Response<ApiResponse>) => {
  try {
    const version = store.specimenVersions.get(req.params.id);

    if (!version) {
      res.status(404).json({ success: false, message: '版本不存在' });
      return;
    }

    res.json({
      success: true,
      data: version
    });
  } catch (error) {
    res.status(500).json({ success: false, message: '获取版本详情失败' });
  }
});

router.post('/:id/rollback', authenticateToken, (req: AuthRequest, res: Response<ApiResponse>) => {
  try {
    const versionId = req.params.id;
    const version = store.specimenVersions.get(versionId);

    if (!version) {
      res.status(404).json({ success: false, message: '版本不存在' });
      return;
    }

    const specimen = store.specimens.get(version.specimenId);
    if (!specimen) {
      res.status(404).json({ success: false, message: '关联的标本不存在' });
      return;
    }

    if (req.userRole !== 'admin' && specimen.departmentId !== req.userDepartmentId) {
      res.status(403).json({ success: false, message: '无权执行此操作' });
      return;
    }

    const currentSnapshot = { ...specimen };
    const rollbackSnapshot = version.snapshot;

    const rollbackVersion: SpecimenVersion = {
      id: generateId(),
      specimenId: version.specimenId,
      version: specimen.version + 1,
      snapshot: { ...specimen, ...rollbackSnapshot, version: specimen.version + 1 },
      changeDescription: `回滚至版本 v${version.version}`,
      changedBy: req.userId!,
      changes: Object.keys(currentSnapshot).map(key => ({
        field: key,
        oldValue: (currentSnapshot as any)[key],
        newValue: (rollbackSnapshot as any)[key]
      })).filter(change => JSON.stringify(change.oldValue) !== JSON.stringify(change.newValue)),
      changedAt: new Date()
    };

    store.specimenVersions.set(rollbackVersion.id, rollbackVersion);

    const updatedSpecimen = {
      ...specimen,
      ...rollbackSnapshot,
      id: specimen.id,
      version: specimen.version + 1,
      updatedBy: req.userId!,
      updatedAt: new Date(),
      lastModifiedAt: new Date()
    };

    store.specimens.set(specimen.id, updatedSpecimen);

    res.json({
      success: true,
      data: {
        newVersionId: rollbackVersion.id,
        newVersion: rollbackVersion.version,
        specimen: updatedSpecimen
      },
      message: `成功回滚至版本 v${version.version}`
    });
  } catch (error) {
    res.status(500).json({ success: false, message: '版本回滚失败' });
  }
});

router.get('/compare/:version1/:version2', authenticateToken, (req: AuthRequest, res: Response<ApiResponse>) => {
  try {
    const { version1, version2 } = req.params;

    const v1 = store.specimenVersions.get(version1);
    const v2 = store.specimenVersions.get(version2);

    if (!v1 || !v2) {
      res.status(404).json({ success: false, message: '版本不存在' });
      return;
    }

    const allKeys = new Set([
      ...Object.keys(v1.snapshot),
      ...Object.keys(v2.snapshot)
    ]);

    const differences = Array.from(allKeys)
      .filter(key => JSON.stringify((v1.snapshot as any)[key]) !== JSON.stringify((v2.snapshot as any)[key]))
      .map(key => ({
        field: key,
        version1: (v1.snapshot as any)[key],
        version2: (v2.snapshot as any)[key]
      }));

    res.json({
      success: true,
      data: {
        version1: { id: v1.id, version: v1.version, changedAt: v1.changedAt },
        version2: { id: v2.id, version: v2.version, changedAt: v2.changedAt },
        differences
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, message: '版本对比失败' });
  }
});

export default router;
