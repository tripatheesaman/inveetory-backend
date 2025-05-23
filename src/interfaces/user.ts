import { RowDataPacket } from 'mysql2';

export interface User extends RowDataPacket {
    id: number;
    username: string;
    password: string;
    first_name: string;
    last_name: string;
    staffid: string;
    designation: string;
    can_reset_password: boolean;
    status: string;
    created_by: string;
    updated_by: string;
    created_at: Date;
    updated_at: Date;
    role_id: number;
}

export interface Role extends RowDataPacket {
    role_id: number;
    permission_id: string;
    heirarchy: number;
    role_name: string;
}

export interface UserPermission extends RowDataPacket {
    id: number;
    permission_name: string;
    allowed_user_ids: string;
    permission_readable: string;
    permission_type: string;
}

export interface UserWithRole extends User {
    role_name: string;
    heirarchy: number;
} 