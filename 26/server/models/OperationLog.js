const { BaseModel } = require('./BaseModel');

class OperationLogModel extends BaseModel {
  constructor() {
    super('operationLogs');
  }
}

const OperationLog = new OperationLogModel();
module.exports = OperationLog;
