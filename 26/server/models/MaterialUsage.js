const { BaseModel } = require('./BaseModel');

class MaterialUsageModel extends BaseModel {
  constructor() {
    super('materialUsages');
  }

  findAll(options = {}) {
    const data = super.findAll(options);
    return data.map(item => ({
      ...item,
      archive: item.archiveId ? require('./Archive').findByPk(item.archiveId) : null,
      material: item.materialId ? require('./Material').findByPk(item.materialId) : null
    }));
  }
}

const MaterialUsage = new MaterialUsageModel();
module.exports = MaterialUsage;
