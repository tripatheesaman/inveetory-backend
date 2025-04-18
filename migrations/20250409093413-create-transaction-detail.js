'use strict';
/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('TransactionDetails', {
      id: {
        allowNull: false,
        autoIncrement: true,
        primaryKey: true,
        type: Sequelize.INTEGER
      },
      transaction_type: {
        type: Sequelize.STRING
      },
      transaction_quantity: {
        type: Sequelize.FLOAT
      },
      transaction_date: {
        type: Sequelize.DATE
      },
      transaction_status: {
        type: Sequelize.STRING
      },
      transaction_done_by: {
        type: Sequelize.STRING
      },
      transaction_updated_by: {
        type: Sequelize.STRING
      },
      transaction_updated: {
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
    await queryInterface.dropTable('TransactionDetails');
  }
};