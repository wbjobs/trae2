const { BaseModel } = require('./BaseModel');

class SignatureModel extends BaseModel {
  constructor() {
    super('signatures');
  }

  findAll(options = {}) {
    const data = super.findAll(options);
    return data.map(item => ({
      ...item,
      archive: item.archiveId ? require('./Archive').findByPk(item.archiveId) : null,
      signer: item.signerId ? require('./User').findByPk(item.signerId) : null
    }));
  }
}

const Signature = new SignatureModel();
module.exports = Signature;
