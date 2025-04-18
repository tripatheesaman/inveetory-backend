'use strict';
const {
  Model
} = require('sequelize');
module.exports = (sequelize, DataTypes) => {
  class StockDetail extends Model {
    /**
     * Helper method for defining associations.
     * This method is not a part of Sequelize lifecycle.
     * The `models/index` file will call this method automatically.
     */
    static associate(models) {
      // define association here
    }
  }
  StockDetail.init({
    nac_code: DataTypes.STRING,
    item_name: DataTypes.TEXT,
    part_numbers: DataTypes.TEXT,
    applicable_equipments: DataTypes.TEXT,
    open_quantity8182: DataTypes.FLOAT,
    openamount8182: DataTypes.FLOAT,
    location: DataTypes.STRING,
    cardnumber: DataTypes.INTEGER,
    apparent_balance: DataTypes.FLOAT,
    last_updated: DataTypes.DATE,
    updated_by: DataTypes.TEXT
  }, {
    sequelize,
    modelName: 'StockDetail',
  });
  return StockDetail;
};