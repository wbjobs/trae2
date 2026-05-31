const { BaseModel } = require('./BaseModel');

class CraftStepModel extends BaseModel {
  constructor() {
    super('craftSteps');
  }
}

const CraftStep = new CraftStepModel();
module.exports = CraftStep;
