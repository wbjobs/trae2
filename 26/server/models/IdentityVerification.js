const { BaseModel } = require('./BaseModel');

class IdentityVerificationModel extends BaseModel {
  constructor() {
    super('identityVerifications');
  }

  findAll(options = {}) {
    const data = super.findAll(options);
    return data.map(item => ({
      ...item,
      user: item.userId ? require('./User').findByPk(item.userId) : null
    }));
  }
}

const IdentityVerification = new IdentityVerificationModel();
module.exports = IdentityVerification;
