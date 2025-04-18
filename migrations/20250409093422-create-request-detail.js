'use strict';
/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('RequestDetails', {
      id: {
        allowNull: false,
        autoIncrement: true,
        primaryKey: true,
        type: Sequelize.INTEGER
      },
      transaction_id: {
        type: Sequelize.INTEGER
      },
      request_number: {
        type: Sequelize.STRING
      },
      item_name: {
        type: Sequelize.STRING
      },
      part_number: {
        type: Sequelize.STRING
      },
      requested_quantity: {
        type: Sequelize.FLOAT
      },
      isReceived: {
        type: Sequelize.BOOLEAN
      },
      isConfirmed: {
        type: Sequelize.BOOLEAN
      },
      requested_by: {
        type: Sequelize.STRING
      },
      requested_date: {
        type: Sequelize.DATE
      },
      request_updated_by: {
        type: Sequelize.STRING
      },
      requested_upated_at: {
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
    await queryInterface.dropTable('RequestDetails');
  }
};