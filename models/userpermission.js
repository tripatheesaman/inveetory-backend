'use strict';
const {
  Model
} = require('sequelize');
module.exports = (sequelize, DataTypes) => {
  class UserPermission extends Model {
    /**
     * Helper method for defining associations.
     * This method is not a part of Sequelize lifecycle.
     * The `models/index` file will call this method automatically.
     */
    static associate(models) {
      // define association here
    }
  }
  UserPermission.init({
    permission_name: DataTypes.STRING,
    allowed_user_ids: DataTypes.INTEGER
  }, {
    sequelize,
    modelName: 'UserPermission',
  });
  return UserPermission;
};