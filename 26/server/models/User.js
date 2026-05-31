const { BaseModel } = require('./BaseModel');

class UserModel extends BaseModel {
  constructor() {
    super('users');
  }
}

const User = new UserModel();
module.exports = User;
