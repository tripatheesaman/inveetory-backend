import pool from '../src/config/db';

const configs = [
  {
    config_type: 'rrp',
    config_name: 'supplier_list_local',
    config_value: `Nepal Oil Corporation Limited, Balaju Auto Works Private Limited, National Electric Trading, Raj Shyamaji Enterprises, Reliable Bearings Nepal Private Limited, All Nepal Trade Center, Ladali International Private Limited, Modern Auto International, Shrisha Traders, New Maruti Auto Concern Private Limited, Creative Business Enterprises, Neha Trade Link Private Limited, Greatwall Trading Company Private Limited, Ghiraiya International, New Auto Green Parts, Brij Motors, Advance Engineering and Machinery Trading, Prashidhi Trade Concern, Surya Shree Enterprises, BPS Petroleum Limited, Bansal Enterprises, Namaste Nepal Multi Traders, Brij Auto Traders Private Limited, Himalshree Auto Traders Private Limited, M. K. Incorporated Private Limited, New Shreya Enterprises, Far Eastern Trading Company, S. S. Auto and Electric Shop, H. B. Auto Tech Private Limited, Aarati Suppliers, Kendriya Karaghar Karkhana (Central Jail Factory), Team Works and Solutions Center Private Limited, S. B. Machinery Private Limited, Purnachwal Lube Oil Limited, Engineering Equipment Enterprises Private Limited, Churiyamai Earthmoving Electricals, Nepal Fire and Safety Solutions Private Limited, Akhanda International Private Limited, Autoparts System and Supplier, United GMR Trading Company Private Limited, Explore Earth Movers Private Limited, Water Engineering and Training Centre Private Limited, Sunrise Trading Concern, Worldwide Trading Company Private Limited, Shree Om Auto Lube Private Limited, Four Season Trade Link, Bajra Ganesh Suppliers, Bicky Hardware House Private Limited, Nepal Safety Centre Private Limited, Shree New Shreya Enterprises, Neupane Engineering Private Limited, Royal Traders, H. A. Trade Concern Private Limited, New International Automobiles, Rajesh Hardwares Private Limited, Araniko Hardware and Sanitary, S. L. Business House Private Limited, Aayusha Hardwares and Suppliers, Nikunj Traders, Kapish Trade Concern, M. G. Chemical and Training International, Shree Raj Steel House, Ayansh Traders Private Limited, Tara Trade Concern, Nainsi Traders and Enterprises, Sunapati Plastic Pasal, Kalika Trade Suppliers, Hitco Private Limited, Kabin International Private Limited, Gandak Traders Private Limited, Nepal Road Safety Center Private Limited, Suryodaya Incorporated Private Limited, Automobile Business Concern Private Limited, Bagmati Auto Trading, Bajrashree Trade Concern, Stupa Auto, Subha Mangal Paints, R. N. Trade Concern, Shree Shakti Udhyog Private Limited, Nepal Biomedical Engineering and Diagnostic Trade Concern`
  },
  {
    config_type: 'rrp',
    config_name: 'currency_list',
    config_value: 'NPR,USD,EUR,PND'
  },
  {
    config_type: 'rrp',
    config_name: 'supplier_list_foreign',
    config_value: 'TLD Asia Limited, Cobus Industries GmbH, Sheetla Polymers'
  },
  {
    config_type: 'rrp',
    config_name: 'inspection_user_details',
    config_value: '[{"name":"Sohan Kayestha","designation":"In-charge, WTP"},{"name":"Subash Dangi","designation":"Act. Dy Director, GrSD"},{"name":"Dinesh Kumar shah","designation":"In-charge, MGSEM"},{"name":"Kumar Man Dangol","designation":"In-charge, Workshop"},{"name":"Kalyan Karmacharya","designation":"In-charge, RTH"},{"name":"Lokendra Singh Khati","designation":"In-charge, Operation"},{"name":"Sanjiv Kumar Yadav","designation":"In-charge, NEM"},{"name":"Shyam Krishna Palkhel","designation":"In-charge, Cleaning Section"},{"name":"Suman Timila","designation":"In-charge, FSRS"}]'
  },
  {
    config_type: 'rrp',
    config_name: 'vat_rate',
    config_value: '13'
  },
  {
    config_type: 'rrp',
    config_name: 'current_fy',
    config_value: '2081/82'
  },
  {
    config_type: 'fuel',
    config_name: 'valid_equipment_list_diesel',
    config_value: '109,110,112,113,115,116,117,118,201,204,207,327,328,329,330,331,332,333,334,336,338,339,340,341,342,343,344T14,345T15,346T42,417,419,421,422,423,424,425,426,427,428,429,430,431,432,433,434,435,436,437,438,439,440,441,442,444T44,505,506,507,608,609,610,611,612,613,615,616,617,618,619,620,623,624,625,626,627,628,629,630,631,632,633,634T47,700,703,1004,1005,1102,1103,1105,1106,1107,1111,1222,1242,1229,1230,1231,1232,1233,1234,1235,1236,1237,1403,1404,1405,1504,1505,1507,1508,1509,1510,1511,1512T,1602,1603,1703,1704,1705,1706,1707,1708,1709T1,2010,2101,2102,2105,2106,2107,2108,2109,2110,2111,2112,2113,2302,2401,2402,New GSE Thai,Karcher,Cleaning,GS & PMD'
  },
  {
    config_type: 'fuel',
    config_name: 'valid_equipment_list_petrol',
    config_value: '1214,1219,1223,1225,1226,1227,1228,1239,Cleaning'
  },
  {
    config_type: 'fuel',
    config_name: 'oil_codes',
    config_value: 'oil_codes'
  }
];

async function seedConfig() {
  try {
    for (const config of configs) {
      await pool.execute(
        'INSERT INTO app_config (config_type, config_name, config_value) VALUES (?, ?, ?) ON DUPLICATE KEY UPDATE config_value = VALUES(config_value)',
        [config.config_type, config.config_name, config.config_value]
      );
    }
    console.log('Config seeded successfully!');
    await pool.end();
  } catch (error) {
    console.error('Error seeding config:', error);
    await pool.end();
  }
}

seedConfig(); 