const { BaseModel } = require('./BaseModel');

class ArchiveModel extends BaseModel {
  constructor() {
    super('archives');
  }

  findAll(options = {}) {
    const data = super.findAll(options);
    return data.map(item => ({
      ...item,
      artisan: item.artisanId ? require('./User').findByPk(item.artisanId) : null
    }));
  }
}

const Archive = new ArchiveModel();
module.exports = Archive;
