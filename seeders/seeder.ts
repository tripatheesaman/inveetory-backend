import pool from '../src/config/db';

const queries = [`
  CREATE TABLE IF NOT EXISTS app_config (
    id int NOT NULL AUTO_INCREMENT,
    config_type varchar(255) DEFAULT NULL,
    config_name varchar(255) DEFAULT NULL,
    config_value text,
    created_at timestamp NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (id)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
`,
`
  CREATE TABLE IF NOT EXISTS authority_details (
    id int NOT NULL AUTO_INCREMENT,
    authority_type varchar(255) DEFAULT NULL,
    level_1_authority_name varchar(255) DEFAULT NULL,
    level_1_authority_staffid varchar(255) DEFAULT NULL,
    level_1_authority_designation varchar(255) DEFAULT NULL,
    level_2_authority_name varchar(255) DEFAULT NULL,
    level_2_authority_staffid varchar(255) DEFAULT NULL,
    level_2_authority_designation varchar(255) DEFAULT NULL,
    level_3_authority_name varchar(255) DEFAULT NULL,
    level_3_authority_staffid varchar(255) DEFAULT NULL,
    level_3_authority_designation varchar(255) DEFAULT NULL,
    quality_check_authority_name varchar(255) DEFAULT NULL,
    quality_check_authority_staffid varchar(255) DEFAULT NULL,
    quality_check_authority_designation varchar(255) DEFAULT NULL,
    created_at timestamp NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (id)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
`,
`
  CREATE TABLE IF NOT EXISTS roles (
    role_id int NOT NULL AUTO_INCREMENT,
    permission_id text,
    heirarchy int DEFAULT NULL,
    role_name enum('superadmin','admin','entrant','manager','custom') DEFAULT 'entrant',
    PRIMARY KEY (role_id),
    UNIQUE KEY heirarchy (heirarchy)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
`,
`
  CREATE TABLE IF NOT EXISTS users (
    id int NOT NULL AUTO_INCREMENT,
    username varchar(255) NOT NULL,
    password varchar(255) NOT NULL,
    first_name varchar(255) NOT NULL,
    last_name varchar(255) NOT NULL,
    staffid varchar(255) NOT NULL,
    designation varchar(255) NOT NULL,
    can_reset_password tinyint(1) DEFAULT '0',
    status varchar(50) DEFAULT 'active',
    created_by varchar(255) DEFAULT NULL,
    updated_by varchar(255) DEFAULT NULL,
    created_at timestamp NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    role_id int DEFAULT NULL,
    PRIMARY KEY (id),
    UNIQUE KEY username (username),
    KEY role_id (role_id),
    CONSTRAINT fk_users_roles FOREIGN KEY (role_id) REFERENCES roles (role_id) ON DELETE SET NULL
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
`,
`
  CREATE TABLE IF NOT EXISTS user_permissions (
    id int NOT NULL AUTO_INCREMENT,
    permission_name varchar(255) NOT NULL,
    allowed_user_ids text,
    permission_readable varchar(255) DEFAULT NULL,
    permission_type varchar(100) DEFAULT NULL,
    PRIMARY KEY (id),
    UNIQUE KEY permission_name (permission_name)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
`,
`
  CREATE TABLE IF NOT EXISTS notifications (
    id int NOT NULL AUTO_INCREMENT,
    user_id int NOT NULL,
    reference_type varchar(255) DEFAULT NULL,
    message text,
    is_read tinyint(1) DEFAULT '0',
    reference_id int DEFAULT NULL,
    created_at timestamp NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
`,
`
  CREATE TABLE IF NOT EXISTS issue_details (
    id int NOT NULL AUTO_INCREMENT,
    nac_code varchar(255) DEFAULT NULL,
    issue_date datetime DEFAULT NULL,
    part_number text,
    issued_for text,
    issue_quantity float DEFAULT NULL,
    issue_cost float DEFAULT NULL,
    remaining_balance float DEFAULT NULL,
    issued_by text,
    issued_at timestamp NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    updated_by text,
    issue_slip_number varchar(255) DEFAULT NULL,
    current_fy varchar(255) DEFAULT NULL,
    approval_status enum('PENDING','APPROVED','REJECTED') DEFAULT 'PENDING',
    approved_by varchar(255) DEFAULT NULL,
    PRIMARY KEY (id)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
`,
`
  CREATE TABLE IF NOT EXISTS fuel_records (
    id int NOT NULL AUTO_INCREMENT,
    fuel_type enum('Petrol','Diesel') DEFAULT 'Diesel',
    kilometers int DEFAULT NULL,
    issue_fk int DEFAULT NULL,
    fuel_price decimal(10,2) DEFAULT NULL,
    created_datetime timestamp NULL DEFAULT CURRENT_TIMESTAMP,
    updated_datetime timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    is_kilometer_reset tinyint(1) DEFAULT '0',
    number_of_flights int DEFAULT NULL,
    week_number int DEFAULT NULL,
    fy varchar(50) DEFAULT NULL,
    PRIMARY KEY (id),
    KEY fk_fuel_issue (issue_fk),
    CONSTRAINT fk_fuel_issue FOREIGN KEY (issue_fk) REFERENCES issue_details (id) ON DELETE CASCADE
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
`,
`
  CREATE TABLE IF NOT EXISTS receive_details (
    id int NOT NULL AUTO_INCREMENT,
    receive_date date NOT NULL,
    request_fk int NOT NULL,
    nac_code varchar(50) DEFAULT NULL,
    part_number varchar(100) DEFAULT NULL,
    item_name varchar(255) DEFAULT NULL,
    received_quantity decimal(10,2) NOT NULL,
    unit varchar(50) DEFAULT NULL,
    approval_status enum('PENDING','APPROVED','REJECTED') DEFAULT 'PENDING',
    approved_by varchar(100) DEFAULT NULL,
    rrp_fk int DEFAULT NULL,
    created_at timestamp NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    image_path text,
    location varchar(255) DEFAULT NULL,
    card_number varchar(255) DEFAULT NULL,
    rejected_by varchar(255) DEFAULT NULL,
    rejection_reason text,
    received_by varchar(255) DEFAULT NULL,
    PRIMARY KEY (id)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
`,
`
  CREATE TABLE IF NOT EXISTS request_details (
    id int NOT NULL AUTO_INCREMENT,
    request_number varchar(50) NOT NULL,
    nac_code varchar(50) NOT NULL,
    request_date datetime NOT NULL,
    part_number varchar(100) NOT NULL,
    item_name varchar(255) NOT NULL,
    unit varchar(50) NOT NULL,
    requested_quantity int NOT NULL,
    current_balance decimal(10,2) NOT NULL,
    previous_rate varchar(55) NOT NULL,
    equipment_number varchar(100) NOT NULL,
    image_path varchar(255) DEFAULT NULL,
    specifications text,
    remarks text,
    requested_by varchar(100) NOT NULL,
    approval_status enum('PENDING','APPROVED','REJECTED') NOT NULL DEFAULT 'PENDING',
    is_received tinyint(1) DEFAULT '0',
    approved_by varchar(255) DEFAULT NULL,
    rejected_by varchar(255) DEFAULT NULL,
    rejection_reason text,
    receive_fk int DEFAULT NULL,
    created_at timestamp NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    KEY idx_request_number (request_number),
    KEY idx_nac_code (nac_code),
    KEY idx_request_date (request_date),
    KEY idx_part_number (part_number),
    KEY idx_item_name (item_name),
    KEY idx_equipment_number (equipment_number),
    KEY idx_requested_by (requested_by)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
`,
`
  CREATE TABLE IF NOT EXISTS rrp_details (
    id int NOT NULL AUTO_INCREMENT,
    receive_fk int NOT NULL,
    rrp_number varchar(50) NOT NULL,
    supplier_name varchar(100) DEFAULT NULL,
    date date DEFAULT NULL,
    currency varchar(10) DEFAULT 'NPR',
    forex_rate decimal(10,2) DEFAULT '1.00',
    item_price decimal(12,2) DEFAULT NULL,
    customs_charge decimal(12,2) DEFAULT NULL,
    customs_date date DEFAULT NULL,
    customs_number varchar(255) DEFAULT NULL,
    freight_charge decimal(12,2) DEFAULT NULL,
    customs_service_charge decimal(12,2) DEFAULT NULL,
    vat_percentage decimal(5,2) DEFAULT NULL,
    invoice_number varchar(255) DEFAULT NULL,
    invoice_date date DEFAULT NULL,
    po_number varchar(255) DEFAULT NULL,
    total_amount decimal(10,2) DEFAULT NULL,
    airway_bill_number varchar(255) DEFAULT NULL,
    inspection_details text,
    current_fy varchar(50) DEFAULT NULL,
    approval_status enum('PENDING','APPROVED','REJECTED') DEFAULT 'PENDING',
    created_by varchar(100) DEFAULT NULL,
    created_at timestamp NULL DEFAULT CURRENT_TIMESTAMP,
    approved_by varchar(100) DEFAULT NULL,
    rejected_by varchar(100) DEFAULT NULL,
    rejection_reason text,
    updated_at timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    KEY rrp_number (rrp_number),
    KEY item_price (item_price),
    KEY po_number (po_number)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
`,
`
  CREATE TABLE IF NOT EXISTS stock_details (
    id int NOT NULL AUTO_INCREMENT,
    nac_code varchar(50) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
    item_name text COLLATE utf8mb4_unicode_ci,
    part_numbers text COLLATE utf8mb4_unicode_ci,
    applicable_equipments text COLLATE utf8mb4_unicode_ci,
    open_quantity decimal(10,2) DEFAULT NULL,
    open_amount float DEFAULT NULL,
    current_balance float NOT NULL DEFAULT '0',
    location varchar(100) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
    card_number varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
    unit varchar(50) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
    image_url varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
    created_at timestamp NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    updated_by varchar(100) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
    PRIMARY KEY (id),
    KEY idx_nac_code (nac_code),
    KEY idx_location (location),
    KEY idx_cardnumber (card_number),
    KEY idx_updated_at (updated_at),
    FULLTEXT KEY idx_search_fields (nac_code,item_name,part_numbers,applicable_equipments)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
`,
`
  CREATE TABLE IF NOT EXISTS transaction_details (
    id int NOT NULL AUTO_INCREMENT,
    transaction_type enum('issue','repair','purchase','fabrication') DEFAULT 'purchase',
    transaction_quantity float NOT NULL,
    transaction_date datetime DEFAULT CURRENT_TIMESTAMP,
    transaction_status enum('confirmed','reverted','pending') DEFAULT 'pending',
    transaction_done_by varchar(255) NOT NULL,
    transaction_updated_by varchar(255) DEFAULT NULL,
    transaction_updated timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (id)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
`];

// Add this query to enforce unique constraint on (config_type, config_name)
const uniqueConstraintQuery = `
  ALTER TABLE app_config
  ADD CONSTRAINT unique_config_type_name UNIQUE (config_type, config_name);
`;

const seedDatabase = async () => {
  for (const query of queries) {
    try {
      await pool.execute(query);
      console.log('Executed query successfully');
    } catch (error) {
      console.error('Error executing query:', error);
    }
  }
  // Add unique constraint after table creation
  try {
    await pool.execute(uniqueConstraintQuery);
    console.log('Unique constraint added to app_config');
  } catch (error) {
    const err = error as { code?: string };
    if (err && err.code === 'ER_DUP_KEYNAME') {
      console.log('Unique constraint already exists on app_config');
    } else if (err && err.code === 'ER_DUP_ENTRY') {
      console.error('Duplicate entries exist in app_config. Please resolve them before adding the unique constraint.');
    } else {
      console.error('Error adding unique constraint:', error);
    }
  }

  // Insert dummy authority_details for fuel, request, and rrp
  const dummyAuthorityTypes = ['fuel', 'request', 'rrp'];
  for (const type of dummyAuthorityTypes) {
    try {
      await pool.execute(
        `INSERT INTO authority_details (
          authority_type,
          level_1_authority_name,
          level_1_authority_staffid,
          level_1_authority_designation,
          level_2_authority_name,
          level_2_authority_staffid,
          level_2_authority_designation,
          level_3_authority_name,
          level_3_authority_staffid,
          level_3_authority_designation,
          quality_check_authority_name,
          quality_check_authority_staffid,
          quality_check_authority_designation
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          type,
          '', '', null, null, null, null, null, null, null, null, null, null
        ]
      );
      console.log(`Inserted dummy authority_details for ${type}`);
    } catch (error) {
      console.error(`Error inserting dummy authority_details for ${type}:`, error);
    }
  }

  await pool.end();
};

seedDatabase();
