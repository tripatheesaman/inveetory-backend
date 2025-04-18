'use strict';
/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('IssueDetails', {
      id: {
        allowNull: false,
        autoIncrement: true,
        primaryKey: true,
        type: Sequelize.INTEGER
      },
      nac_code: {
        type: Sequelize.STRING
      },
      issue_date: {
        type: Sequelize.DATE
      },
      item_name: {
        type: Sequelize.TEXT
      },
      part_numbers: {
        type: Sequelize.TEXT
      },
      applicable_equipments: {
        type: Sequelize.TEXT
      },
      issue_quantity: {
        type: Sequelize.FLOAT
      },
      issue_cost: {
        type: Sequelize.FLOAT
      },
      remaining_balance: {
        type: Sequelize.FLOAT
      },
      issued_by: {
        type: Sequelize.TEXT
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
    await queryInterface.dropTable('IssueDetails');
  }
};