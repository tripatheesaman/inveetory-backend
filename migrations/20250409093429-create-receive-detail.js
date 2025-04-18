'use strict';
/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('ReceiveDetails', {
      id: {
        allowNull: false,
        autoIncrement: true,
        primaryKey: true,
        type: Sequelize.INTEGER
      },
      request_fk: {
        type: Sequelize.INTEGER
      },
      receive_number: {
        type: Sequelize.STRING
      },
      received_quantity: {
        type: Sequelize.FLOAT
      },
      is_confirmed: {
        type: Sequelize.BOOLEAN
      },
      item_price: {
        type: Sequelize.FLOAT
      },
      vat_stauts: {
        type: Sequelize.BOOLEAN
      },
      vat_amount: {
        type: Sequelize.FLOAT
      },
      customs_service_charge: {
        type: Sequelize.FLOAT
      },
      custome_charge: {
        type: Sequelize.FLOAT
      },
      receive_source: {
        type: Sequelize.STRING
      },
      currency: {
        type: Sequelize.STRING
      },
      freight_charge: {
        type: Sequelize.FLOAT
      },
      forex_rate: {
        type: Sequelize.FLOAT
      },
      supplier_name: {
        type: Sequelize.STRING
      },
      receive_date: {
        type: Sequelize.DATE
      },
      is_rrp: {
        type: Sequelize.BOOLEAN
      },
      rrp_date: {
        type: Sequelize.DATE
      },
      invoice_number: {
        type: Sequelize.STRING
      },
      invoice_date: {
        type: Sequelize.DATE
      },
      customs_ref_number: {
        type: Sequelize.STRING
      },
      customs_date: {
        type: Sequelize.DATE
      },
      airway_bill_number: {
        type: Sequelize.STRING
      },
      po_number: {
        type: Sequelize.STRING
      },
      invoice_date_to: {
        type: Sequelize.DATE
      },
      rrp_status: {
        type: Sequelize.STRING
      },
      rrp_created_by: {
        type: Sequelize.STRING
      },
      rrp_updated_by: {
        type: Sequelize.STRING
      },
      rrp_inspected_by: {
        type: Sequelize.STRING
      },
      rrp_voided_by: {
        type: Sequelize.STRING
      },
      rrp_updated: {
        type: Sequelize.DATE
      },
      createdAt: {
        allowNull: false,
        type: Sequelize.DATE
      },
      updatedAt: {
        allowNull: false,
        type: Sequelize.DATE
      }
    });
  },
  async down(queryInterface, Sequelize) {
    await queryInterface.dropTable('ReceiveDetails');
  }
};