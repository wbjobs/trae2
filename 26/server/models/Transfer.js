const { BaseModel } = require('./BaseModel');

class TransferModel extends BaseModel {
  constructor() {
    super('transfers');
  }

  findAll(options = {}) {
    const data = super.findAll(options);
    return data.map(item => ({
      ...item,
      archive: item.archiveId ? require('./Archive').findByPk(item.archiveId) : null
    }));
  }
}

const Transfer = new TransferModel();
module.exports = Transfer;
