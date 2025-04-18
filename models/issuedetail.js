'use strict';
const {
  Model
} = require('sequelize');
module.exports = (sequelize, DataTypes) => {
  class IssueDetail extends Model {
    /**
     * Helper method for defining associations.
     * This method is not a part of Sequelize lifecycle.
     * The `models/index` file will call this method automatically.
     */
    static associate(models) {
      // define association here
    }
  }
  IssueDetail.init({
    nac_code: DataTypes.STRING,
    issue_date: DataTypes.DATE,
    item_name: DataTypes.TEXT,
    part_numbers: DataTypes.TEXT,
    applicable_equipments: DataTypes.TEXT,
    issue_quantity: DataTypes.FLOAT,
    issue_cost: DataTypes.FLOAT,
    remaining_balance: DataTypes.FLOAT,
    issued_by: DataTypes.TEXT
  }, {
    sequelize,
    modelName: 'IssueDetail',
  });
  return IssueDetail;
};