const { BaseModel } = require('./BaseModel');

class MaterialModel extends BaseModel {
  constructor() {
    super('materials');
  }
}

const Material = new MaterialModel();
module.exports = Material;
