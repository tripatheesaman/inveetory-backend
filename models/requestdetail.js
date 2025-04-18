'use strict';
const {
  Model
} = require('sequelize');
module.exports = (sequelize, DataTypes) => {
  class RequestDetail extends Model {
    /**
     * Helper method for defining associations.
     * This method is not a part of Sequelize lifecycle.
     * The `models/index` file will call this method automatically.
     */
    static associate(models) {
      // define association here
    }
  }
  RequestDetail.init({
    transaction_id: DataTypes.INTEGER,
    request_number: DataTypes.STRING,
    item_name: DataTypes.STRING,
    part_number: DataTypes.STRING,
    requested_quantity: DataTypes.FLOAT,
    isReceived: DataTypes.BOOLEAN,
    isConfirmed: DataTypes.BOOLEAN,
    requested_by: DataTypes.STRING,
    requested_date: DataTypes.DATE,
    request_updated_by: DataTypes.STRING,
    requested_upated_at: DataTypes.DATE
  }, {
    sequelize,
    modelName: 'RequestDetail',
  });
  return RequestDetail;
};