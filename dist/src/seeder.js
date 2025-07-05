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
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const db_1 = __importDefault(require("./config/db"));
const bcrypt = require('bcryptjs');
function hashPassword(password) {
    return __awaiter(this, void 0, void 0, function* () {
        const salt = yield bcrypt.genSalt(10); // Generate a salt with 10 rounds
        return bcrypt.hash(password, salt); // Hash the password
    });
}
// Function to seed the roles and superadmin user
function seedDatabase() {
    return __awaiter(this, void 0, void 0, function* () {
        var _a;
        try {
            // Insert roles into the roles table
            const roles = [
                { name: 'superadmin', role_permissions: '1,2,3,4,5', heirarchy: 0 },
                { name: 'admin', role_permissions: '', heirarchy: 1 },
                { name: 'manager', role_permissions: '', heirarchy: 2 },
                { name: 'entrant', role_permissions: '', heirarchy: 3 },
                { name: 'custom', role_permissions: '', heirarchy: 4 },
            ];
            // Insert each role into the database
            for (const role of roles) {
                yield db_1.default.execute('INSERT INTO roles (role_name, permission_id, heirarchy) VALUES (?, ?, ?)', [role.name, role.role_permissions, role.heirarchy]);
                console.log(`Inserted role: ${role.name}`);
            }
            // Create a superadmin user (this example uses a hashed password)
            const passwordHash = yield hashPassword('Testing@123'); // Superadmin password
            // Find the Super Admin role id
            const [rows] = yield db_1.default.execute('SELECT role_id FROM roles WHERE role_name = ?', ['superadmin']);
            const superAdminRoleId = (_a = rows[0]) === null || _a === void 0 ? void 0 : _a.role_id;
            if (!superAdminRoleId) {
                throw new Error('Super Admin role not found!');
            }
            // Insert the superadmin user into the database
            yield db_1.default.execute('INSERT INTO users (username, password, role_id, first_name, last_name, staffid, designation, status, can_reset_password) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)', ['superadmin', passwordHash, superAdminRoleId, 'Saman', 'Tripathee', 'STAFF001', 'God', true, true]);
            console.log('Superadmin user created successfully!');
            // Close the connection pool after seeding
            yield db_1.default.end();
        }
        catch (error) {
            console.error('Error seeding database:', error);
            yield db_1.default.end(); // Close the connection pool in case of an error
        }
    });
}
// Run the seeding process
seedDatabase();
