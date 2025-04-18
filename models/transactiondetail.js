'use strict';
const {
  Model
} = require('sequelize');
module.exports = (sequelize, DataTypes) => {
  class TransactionDetail extends Model {
    /**
     * Helper method for defining associations.
     * This method is not a part of Sequelize lifecycle.
     * The `models/index` file will call this method automatically.
     */
    static associate(models) {
      // define association here
    }
  }
  TransactionDetail.init({
    transaction_type: DataTypes.STRING,
    transaction_quantity: DataTypes.FLOAT,
    transaction_date: DataTypes.DATE,
    transaction_status: DataTypes.STRING,
    transaction_done_by: DataTypes.STRING,
    transaction_updated_by: DataTypes.STRING,
    transaction_updated: DataTypes.DATE
  }, {
    sequelize,
    modelName: 'TransactionDetail',
  });
  return TransactionDetail;
};