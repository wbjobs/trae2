const { BaseModel } = require('./BaseModel');

class TransferWarning extends BaseModel {
  constructor() {
    super('transferWarnings');
  }

  create(data) {
    return super.create({
      archiveId: data.archiveId,
      archiveName: data.archiveName,
      transferId: data.transferId,
      warningType: data.warningType,
      warningLevel: data.warningLevel || 'normal',
      title: data.title,
      message: data.message,
      expectedArrival: data.expectedArrival,
      actualArrival: data.actualArrival,
      handlerId: data.handlerId,
      handlerName: data.handlerName,
      status: data.status || 'pending',
      resolvedAt: data.resolvedAt,
      resolvedBy: data.resolvedBy,
      remark: data.remark,
      ...data
    });
  }

  findByArchiveId(archiveId) {
    return this.findAll({ where: { archiveId: parseInt(archiveId) }, order: [['createdAt', 'DESC']] });
  }

  findByTransferId(transferId) {
    return this.findAll({ where: { transferId: parseInt(transferId) }, order: [['createdAt', 'DESC']] });
  }

  findPending() {
    return this.findAll({ where: { status: 'pending' }, order: [['createdAt', 'DESC']] });
  }

  findByLevel(warningLevel) {
    return this.findAll({ where: { warningLevel }, order: [['createdAt', 'DESC']] });
  }

  resolve(id, resolvedBy, remark) {
    return this.update(id, {
      status: 'resolved',
      resolvedAt: new Date().toISOString(),
      resolvedBy,
      remark
    });
  }



  getStats() {
    const all = this.findAll();
    return {
      total: all.length,
      pending: all.filter(w => w.status === 'pending').length,
      resolved: all.filter(w => w.status === 'resolved').length,
      critical: all.filter(w => w.warningLevel === 'critical').length,
      warning: all.filter(w => w.warningLevel === 'warning').length,
      normal: all.filter(w => w.warningLevel === 'normal').length
    };
  }
}

const transferWarning = new TransferWarning();
module.exports = transferWarning;
module.exports.TransferWarning = TransferWarning;
