'use strict';
/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('StockDetails', {
      id: {
        allowNull: false,
        autoIncrement: true,
        primaryKey: true,
        type: Sequelize.INTEGER
      },
      nac_code: {
        type: Sequelize.STRING
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
      open_quantity8182: {
        type: Sequelize.FLOAT
      },
      openamount8182: {
        type: Sequelize.FLOAT
      },
      location: {
        type: Sequelize.STRING
      },
      cardnumber: {
        type: Sequelize.INTEGER
      },
      apparent_balance: {
        type: Sequelize.FLOAT
      },
      last_updated: {
        type: Sequelize.DATE
      },
      updated_by: {
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
    await queryInterface.dropTable('StockDetails');
  }
};