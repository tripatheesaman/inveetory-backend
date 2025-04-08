"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __generator = (this && this.__generator) || function (thisArg, body) {
    var _ = { label: 0, sent: function() { if (t[0] & 1) throw t[1]; return t[1]; }, trys: [], ops: [] }, f, y, t, g = Object.create((typeof Iterator === "function" ? Iterator : Object).prototype);
    return g.next = verb(0), g["throw"] = verb(1), g["return"] = verb(2), typeof Symbol === "function" && (g[Symbol.iterator] = function() { return this; }), g;
    function verb(n) { return function (v) { return step([n, v]); }; }
    function step(op) {
        if (f) throw new TypeError("Generator is already executing.");
        while (g && (g = 0, op[0] && (_ = 0)), _) try {
            if (f = 1, y && (t = op[0] & 2 ? y["return"] : op[0] ? y["throw"] || ((t = y["return"]) && t.call(y), 0) : y.next) && !(t = t.call(y, op[1])).done) return t;
            if (y = 0, t) op = [op[0] & 2, t.value];
            switch (op[0]) {
                case 0: case 1: t = op; break;
                case 4: _.label++; return { value: op[1], done: false };
                case 5: _.label++; y = op[1]; op = [0]; continue;
                case 7: op = _.ops.pop(); _.trys.pop(); continue;
                default:
                    if (!(t = _.trys, t = t.length > 0 && t[t.length - 1]) && (op[0] === 6 || op[0] === 2)) { _ = 0; continue; }
                    if (op[0] === 3 && (!t || (op[1] > t[0] && op[1] < t[3]))) { _.label = op[1]; break; }
                    if (op[0] === 6 && _.label < t[1]) { _.label = t[1]; t = op; break; }
                    if (t && _.label < t[2]) { _.label = t[2]; _.ops.push(op); break; }
                    if (t[2]) _.ops.pop();
                    _.trys.pop(); continue;
            }
            op = body.call(thisArg, _);
        } catch (e) { op = [6, e]; y = 0; } finally { f = t = 0; }
        if (op[0] & 5) throw op[1]; return { value: op[0] ? op[1] : void 0, done: true };
    }
};
Object.defineProperty(exports, "__esModule", { value: true });
var db_1 = require("./config/db");
var bcrypt = require('bcryptjs');
function hashPassword(password) {
    return __awaiter(this, void 0, void 0, function () {
        var salt;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0: return [4 /*yield*/, bcrypt.genSalt(10)];
                case 1:
                    salt = _a.sent();
                    return [2 /*return*/, bcrypt.hash(password, salt)]; // Hash the password
            }
        });
    });
}
// Function to seed the roles and superadmin user
function seedDatabase() {
    return __awaiter(this, void 0, void 0, function () {
        var roles, _i, roles_1, role, passwordHash, rows, superAdminRoleId, error_1;
        var _a;
        return __generator(this, function (_b) {
            switch (_b.label) {
                case 0:
                    _b.trys.push([0, 9, , 11]);
                    roles = [
                        { name: 'superadmin', role_permissions: '1,2,3,4,5', heirarchy: 0 },
                        { name: 'admin', role_permissions: '', heirarchy: 1 },
                        { name: 'manager', role_permissions: '', heirarchy: 2 },
                        { name: 'entrant', role_permissions: '', heirarchy: 3 },
                        { name: 'custom', role_permissions: '', heirarchy: 4 },
                    ];
                    _i = 0, roles_1 = roles;
                    _b.label = 1;
                case 1:
                    if (!(_i < roles_1.length)) return [3 /*break*/, 4];
                    role = roles_1[_i];
                    return [4 /*yield*/, db_1.default.execute('INSERT INTO roles (role_name, permission_id, heirarchy) VALUES (?, ?, ?)', [role.name, role.role_permissions, role.heirarchy])];
                case 2:
                    _b.sent();
                    console.log("Inserted role: ".concat(role.name));
                    _b.label = 3;
                case 3:
                    _i++;
                    return [3 /*break*/, 1];
                case 4: return [4 /*yield*/, hashPassword('Testing@123')];
                case 5:
                    passwordHash = _b.sent();
                    return [4 /*yield*/, db_1.default.execute('SELECT role_id FROM roles WHERE role_name = ?', ['superadmin'])];
                case 6:
                    rows = (_b.sent())[0];
                    superAdminRoleId = (_a = rows[0]) === null || _a === void 0 ? void 0 : _a.role_id;
                    if (!superAdminRoleId) {
                        throw new Error('Super Admin role not found!');
                    }
                    // Insert the superadmin user into the database
                    return [4 /*yield*/, db_1.default.execute('INSERT INTO users (username, password, role_id, first_name, last_name, staffid, designation, status, can_reset_password) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)', ['superadmin', passwordHash, superAdminRoleId, 'Saman', 'Tripathee', 'STAFF001', 'God', true, true])];
                case 7:
                    // Insert the superadmin user into the database
                    _b.sent();
                    console.log('Superadmin user created successfully!');
                    // Close the connection pool after seeding
                    return [4 /*yield*/, db_1.default.end()];
                case 8:
                    // Close the connection pool after seeding
                    _b.sent();
                    return [3 /*break*/, 11];
                case 9:
                    error_1 = _b.sent();
                    console.error('Error seeding database:', error_1);
                    return [4 /*yield*/, db_1.default.end()];
                case 10:
                    _b.sent(); // Close the connection pool in case of an error
                    return [3 /*break*/, 11];
                case 11: return [2 /*return*/];
            }
        });
    });
}
// Run the seeding process
seedDatabase();
