const deviceValidation = require('./device');
const queryValidation = require('./query');
const alertValidation = require('./alert');
const schemas = require('./schemas');

module.exports = {
  ...deviceValidation,
  ...queryValidation,
  ...alertValidation,
  schemas
};
