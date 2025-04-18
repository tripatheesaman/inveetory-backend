'use strict';
const {
  Model
} = require('sequelize');
module.exports = (sequelize, DataTypes) => {
  class ReceiveDetail extends Model {
    /**
     * Helper method for defining associations.
     * This method is not a part of Sequelize lifecycle.
     * The `models/index` file will call this method automatically.
     */
    static associate(models) {
      // define association here
    }
  }
  ReceiveDetail.init({
    request_fk: DataTypes.INTEGER,
    receive_number: DataTypes.STRING,
    received_quantity: DataTypes.FLOAT,
    is_confirmed: DataTypes.BOOLEAN,
    item_price: DataTypes.FLOAT,
    vat_stauts: DataTypes.BOOLEAN,
    vat_amount: DataTypes.FLOAT,
    customs_service_charge: DataTypes.FLOAT,
    custome_charge: DataTypes.FLOAT,
    receive_source: DataTypes.STRING,
    currency: DataTypes.STRING,
    freight_charge: DataTypes.FLOAT,
    forex_rate: DataTypes.FLOAT,
    supplier_name: DataTypes.STRING,
    receive_date: DataTypes.DATE,
    is_rrp: DataTypes.BOOLEAN,
    rrp_date: DataTypes.DATE,
    invoice_number: DataTypes.STRING,
    invoice_date: DataTypes.DATE,
    customs_ref_number: DataTypes.STRING,
    customs_date: DataTypes.DATE,
    airway_bill_number: DataTypes.STRING,
    po_number: DataTypes.STRING,
    invoice_date_to: DataTypes.DATE,
    rrp_status: DataTypes.STRING,
    rrp_created_by: DataTypes.STRING,
    rrp_updated_by: DataTypes.STRING,
    rrp_inspected_by: DataTypes.STRING,
    rrp_voided_by: DataTypes.STRING,
    rrp_updated: DataTypes.DATE
  }, {
    sequelize,
    modelName: 'ReceiveDetail',
  });
  return ReceiveDetail;
};