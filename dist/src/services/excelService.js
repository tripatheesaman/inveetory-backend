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
exports.generateRRPExcel = exports.generateRequestExcel = exports.ExcelService = void 0;
const exceljs_1 = __importDefault(require("exceljs"));
const path_1 = __importDefault(require("path"));
const db_1 = __importDefault(require("../config/db"));
const sharp_1 = __importDefault(require("sharp"));
const dotenv_1 = __importDefault(require("dotenv"));
const logger_1 = require("../middlewares/logger");
const utils_1 = require("../utils/utils");
dotenv_1.default.config();
class ExcelService {
    static getRequestDetails(requestNumber) {
        return __awaiter(this, void 0, void 0, function* () {
            const connection = yield db_1.default.getConnection();
            try {
                (0, logger_1.logEvents)(`Fetching request details for request number: ${requestNumber}`, "excelServiceLog.log");
                const [requestRows] = yield connection.query('SELECT request_number, request_date, remarks, requested_by FROM request_details WHERE request_number = ? LIMIT 1', [requestNumber]);
                if (!requestRows.length) {
                    (0, logger_1.logEvents)(`Request not found: ${requestNumber}`, "excelServiceLog.log");
                    throw new Error('Request not found');
                }
                const [itemRows] = yield connection.query(`SELECT nac_code, item_name, part_number, unit, requested_quantity, 
                        current_balance, previous_rate, equipment_number, specifications, image_path
                 FROM request_details 
                 WHERE request_number = ?`, [requestNumber]);
                (0, logger_1.logEvents)(`Found ${itemRows.length} items for request: ${requestNumber}`, "excelServiceLog.log");
                const [userRows] = yield connection.query('SELECT first_name, last_name, staffid, designation FROM users WHERE username = ?', [requestRows[0].requested_by]);
                if (!userRows.length) {
                    (0, logger_1.logEvents)(`User details not found for username: ${requestRows[0].requested_by}`, "excelServiceLog.log");
                    throw new Error('User details not found');
                }
                const [authorityRows] = yield connection.query('SELECT level_1_authority_name, level_1_authority_staffid, level_1_authority_designation, ' +
                    'level_2_authority_name, level_2_authority_staffid, level_2_authority_designation ' +
                    'FROM authority_details WHERE authority_type = ? ORDER BY id DESC LIMIT 1', ['request']);
                if (!authorityRows.length) {
                    (0, logger_1.logEvents)('Authority details not found', "excelServiceLog.log");
                    throw new Error('Authority details not found');
                }
                (0, logger_1.logEvents)(`Successfully fetched all details for request: ${requestNumber}`, "excelServiceLog.log");
                return {
                    requestDetails: requestRows[0],
                    items: itemRows,
                    userDetails: userRows[0],
                    authorityDetails: authorityRows[0]
                };
            }
            catch (error) {
                const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
                (0, logger_1.logEvents)(`Error fetching request details for ${requestNumber}: ${errorMessage}`, "excelServiceLog.log");
                throw new Error(`Failed to fetch request details: ${errorMessage}`);
            }
            finally {
                connection.release();
            }
        });
    }
    static formatDate(date) {
        if (!date)
            return '';
        const dateObj = typeof date === 'string' ? new Date(date) : date;
        return dateObj.toISOString().split('T')[0].replace(/-/g, '/');
    }
    static resizeImage(imagePath_1) {
        return __awaiter(this, arguments, void 0, function* (imagePath, maxWidth = 120, maxHeight = 100) {
            try {
                (0, logger_1.logEvents)(`Resizing image: ${imagePath}`, "excelServiceLog.log");
                const frontendUrl = process.env.CORS_ORIGIN || 'http://localhost:3000';
                const imageUrl = `${frontendUrl}${imagePath}`;
                const response = yield fetch(imageUrl);
                if (!response.ok) {
                    throw new Error(`Failed to fetch image from frontend: ${imageUrl}`);
                }
                const arrayBuffer = yield response.arrayBuffer();
                const buffer = Buffer.from(arrayBuffer);
                const resizedBuffer = yield (0, sharp_1.default)(buffer)
                    .resize(maxWidth, maxHeight, { fit: 'inside', background: { r: 255, g: 255, b: 255, alpha: 1 } })
                    .toBuffer();
                (0, logger_1.logEvents)(`Successfully resized image: ${imagePath}`, "excelServiceLog.log");
                return resizedBuffer;
            }
            catch (error) {
                const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
                (0, logger_1.logEvents)(`Error resizing image ${imagePath}: ${errorMessage}`, "excelServiceLog.log");
                return Buffer.from('');
            }
        });
    }
    static generateRequestExcel(requestNumber) {
        return __awaiter(this, void 0, void 0, function* () {
            try {
                (0, logger_1.logEvents)(`Generating request Excel for request number: ${requestNumber}`, "excelServiceLog.log");
                const { requestDetails, items, userDetails, authorityDetails } = yield ExcelService.getRequestDetails(requestNumber);
                const templatePath = path_1.default.join(__dirname, '../../public/templates/template_file.xlsx');
                const workbook = new exceljs_1.default.Workbook();
                yield workbook.xlsx.readFile(templatePath);
                const worksheet = workbook.getWorksheet('Request Template');
                if (!worksheet) {
                    throw new Error('Template worksheet not found');
                }
                const templateWorksheet = workbook.getWorksheet('Request Template');
                if (!templateWorksheet) {
                    throw new Error('Template worksheet not found');
                }
                worksheet.properties = Object.assign({}, templateWorksheet.properties);
                worksheet.views = templateWorksheet.views;
                worksheet.pageSetup = Object.assign({}, templateWorksheet.pageSetup);
                worksheet.headerFooter = Object.assign({}, templateWorksheet.headerFooter);
                worksheet.autoFilter = templateWorksheet.autoFilter;
                worksheet.mergeCells = templateWorksheet.mergeCells;
                templateWorksheet.columns.forEach((col, index) => {
                    if (col) {
                        const targetCol = worksheet.getColumn(index + 1);
                        targetCol.width = col.width || 8.43;
                        if (col.style) {
                            targetCol.style = col.style;
                        }
                        targetCol.hidden = col.hidden || false;
                        targetCol.outlineLevel = col.outlineLevel || 0;
                    }
                });
                templateWorksheet.eachRow((row, rowNumber) => {
                    const targetRow = worksheet.getRow(rowNumber);
                    targetRow.height = row.height || 15;
                    targetRow.hidden = row.hidden || false;
                    targetRow.outlineLevel = row.outlineLevel || 0;
                    row.eachCell((cell, colNumber) => {
                        const targetCell = worksheet.getCell(rowNumber, colNumber);
                        if (cell.style)
                            targetCell.style = cell.style;
                        if (cell.numFmt)
                            targetCell.numFmt = cell.numFmt;
                        if (cell.font)
                            targetCell.font = cell.font;
                        if (cell.alignment)
                            targetCell.alignment = cell.alignment;
                        if (cell.border)
                            targetCell.border = cell.border;
                        if (cell.fill)
                            targetCell.fill = cell.fill;
                    });
                });
                const formattedDate = ExcelService.formatDate(requestDetails.request_date);
                worksheet.getCell('C7').value = `${requestDetails.request_number}(${formattedDate})`;
                let currentRow = 10;
                let specificationsText = '';
                let imagePlaced = false;
                let imageBuffer = null;
                for (const item of items) {
                    worksheet.getCell(`B${currentRow}`).value = item.nac_code;
                    worksheet.getCell(`C${currentRow}`).value = item.item_name;
                    worksheet.getCell(`D${currentRow}`).value = item.part_number;
                    worksheet.getCell(`E${currentRow}`).value = item.unit;
                    worksheet.getCell(`F${currentRow}`).value = item.requested_quantity;
                    worksheet.getCell(`G${currentRow}`).value = item.current_balance;
                    worksheet.getCell(`H${currentRow}`).value = item.previous_rate;
                    worksheet.getCell(`I${currentRow}`).value = (0, utils_1.normalizeEquipmentNumbers)(item.equipment_number);
                    specificationsText += `${item.nac_code}:${item.specifications}\n`;
                    if (!imagePlaced && item.image_path) {
                        imageBuffer = yield ExcelService.resizeImage(item.image_path);
                        imagePlaced = true;
                    }
                    currentRow++;
                }
                worksheet.getCell('A14').value = specificationsText.trim();
                worksheet.getCell('A14').alignment = { vertical: 'top', wrapText: true };
                worksheet.getCell('I14').value = requestDetails.remarks.trim() ? requestDetails.remarks.trim() : "";
                const imageWidthPx = 200;
                const imageHeightPx = 100;
                const startCol = 0;
                const endCol = 7;
                const EMU = 9525;
                let totalWidthPx = 0;
                for (let c = startCol; c <= endCol; c++) {
                    const colWidth = worksheet.getColumn(c + 1).width || 8.43;
                    totalWidthPx += colWidth * 7;
                }
                const imageItems = items.filter(item => item.image_path);
                const imageCount = imageItems.length;
                if (imageCount > 0) {
                    const totalImageWidth = imageCount * imageWidthPx;
                    const totalSpacing = totalWidthPx - totalImageWidth;
                    const initialSpacing = totalSpacing * 0.2;
                    const remainingSpacing = totalSpacing - initialSpacing;
                    const spacingBetweenImages = remainingSpacing / (imageCount - 1);
                    for (let i = 0; i < imageCount; i++) {
                        const item = imageItems[i];
                        const imageBuffer = yield ExcelService.resizeImage(item.image_path, imageWidthPx, imageHeightPx);
                        if (imageBuffer.length > 0) {
                            const imageId = workbook.addImage({
                                buffer: imageBuffer,
                                extension: 'png'
                            });
                            let imagePosition;
                            if (i === 0) {
                                imagePosition = initialSpacing;
                            }
                            else {
                                imagePosition = initialSpacing + (i * imageWidthPx) + (i * spacingBetweenImages);
                            }
                            let currentWidth = 0;
                            let col = startCol;
                            let colOffset = 0;
                            for (let c = startCol; c <= endCol; c++) {
                                const colWidth = worksheet.getColumn(c + 1).width || 8.43;
                                const colWidthPx = colWidth * 7;
                                if (currentWidth + colWidthPx > imagePosition) {
                                    col = c;
                                    colOffset = (imagePosition - currentWidth) * EMU;
                                    break;
                                }
                                currentWidth += colWidthPx;
                            }
                            worksheet.addImage(imageId, {
                                tl: { col, row: 14.2, nativeColOff: colOffset },
                                ext: { width: imageWidthPx, height: imageHeightPx }
                            });
                        }
                    }
                }
                worksheet.getCell('A20').value = `${userDetails.first_name} ${userDetails.last_name}`;
                worksheet.getCell('A21').value = userDetails.staff_id;
                worksheet.getCell('A22').value = userDetails.designation;
                worksheet.getCell('D20').value = authorityDetails.level_1_authority_name;
                worksheet.getCell('D21').value = authorityDetails.level_1_authority_staffid;
                worksheet.getCell('D22').value = authorityDetails.level_1_authority_designation;
                worksheet.getCell('I20').value = authorityDetails.level_2_authority_name;
                worksheet.getCell('I21').value = authorityDetails.level_2_authority_staffid;
                worksheet.getCell('I22').value = authorityDetails.level_2_authority_designation;
                // Delete all other sheets except 'Request Template'
                const sheetsToDelete = workbook.worksheets.filter(sheet => sheet.name !== 'Request Template');
                sheetsToDelete.forEach(sheet => workbook.removeWorksheet(sheet.id));
                (0, logger_1.logEvents)(`Successfully generated request Excel for: ${requestNumber}`, "excelServiceLog.log");
                return yield workbook.xlsx.writeBuffer();
            }
            catch (error) {
                const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
                (0, logger_1.logEvents)(`Error generating request Excel for ${requestNumber}: ${errorMessage}`, "excelServiceLog.log");
                throw new Error(`Failed to generate request Excel: ${errorMessage}`);
            }
        });
    }
    static getRRPDetails(rrpNumber) {
        return __awaiter(this, void 0, void 0, function* () {
            const connection = yield db_1.default.getConnection();
            try {
                (0, logger_1.logEvents)(`Fetching RRP details for RRP number: ${rrpNumber}`, "excelServiceLog.log");
                const [rrpRows] = yield connection.query(`SELECT rrp_number, date, supplier_name, currency, forex_rate, 
                        invoice_number, invoice_date, po_number, airway_bill_number, 
                        inspection_details, approval_status, created_by, customs_date, customs_number, current_fy 
                 FROM rrp_details 
                 WHERE rrp_number = ? 
                 LIMIT 1`, [rrpNumber]);
                if (!rrpRows.length) {
                    (0, logger_1.logEvents)(`RRP not found: ${rrpNumber}`, "excelServiceLog.log");
                    throw new Error('RRP not found');
                }
                const [itemRows] = yield connection.query(`SELECT rd.id, rd.rrp_number, rd.supplier_name, rd.date, rd.currency, rd.forex_rate,
                        rd.item_price, rd.customs_charge, rd.customs_service_charge, rd.vat_percentage,
                        rd.invoice_number, rd.invoice_date, rd.po_number, rd.airway_bill_number,
                        rd.inspection_details, rd.approval_status, rd.created_by, rd.total_amount,
                        rd.freight_charge, rd.customs_date, rd.customs_number, red.item_name, red.part_number,
                        red.received_quantity, red.unit, rqd.equipment_number, red.nac_code, rqd.request_number, rqd.request_date
                 FROM rrp_details rd
                 JOIN receive_details red ON rd.receive_fk = red.id
                 JOIN request_details rqd ON red.request_fk = rqd.id
                 WHERE rd.rrp_number = ?`, [rrpNumber]);
                const [userRows] = yield connection.query('SELECT first_name, last_name, staffid, designation FROM users WHERE username = ?', [rrpRows[0].created_by]);
                if (!userRows.length) {
                    (0, logger_1.logEvents)(`User details not found for username: ${rrpRows[0].created_by}`, "excelServiceLog.log");
                    throw new Error('User details not found');
                }
                const [createdByUserRows] = yield connection.query('SELECT first_name, last_name, staffid, designation FROM users WHERE username = ?', [rrpRows[0].created_by]);
                if (!createdByUserRows.length) {
                    (0, logger_1.logEvents)(`Created by user details not found for username: ${rrpRows[0].created_by}`, "excelServiceLog.log");
                    throw new Error('Created by user details not found');
                }
                const [authorityRows] = yield connection.query('SELECT level_1_authority_name, level_1_authority_staffid, level_1_authority_designation, ' +
                    'quality_check_authority_name, quality_check_authority_staffid, quality_check_authority_designation ' +
                    'FROM authority_details WHERE authority_type = ? ORDER BY id DESC LIMIT 1', ['rrp']);
                if (!authorityRows.length) {
                    (0, logger_1.logEvents)('Authority details not found', "excelServiceLog.log");
                    throw new Error('Authority details not found');
                }
                const inspectionDetails = JSON.parse(rrpRows[0].inspection_details);
                const inspectionUser = inspectionDetails.inspection_user || '';
                const [inspectionName, ...designationParts] = inspectionUser.split(',');
                const inspectionDesignation = designationParts.join(',').trim();
                (0, logger_1.logEvents)(`Successfully fetched all RRP details for: ${rrpNumber}`, "excelServiceLog.log");
                return {
                    rrpDetails: rrpRows[0],
                    items: itemRows,
                    userDetails: userRows[0],
                    authorityDetails: authorityRows[0],
                    createdByUser: createdByUserRows[0],
                    inspectionName,
                    inspectionDesignation,
                };
            }
            catch (error) {
                const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
                (0, logger_1.logEvents)(`Error fetching RRP details for ${rrpNumber}: ${errorMessage}`, "excelServiceLog.log");
                throw new Error(`Failed to fetch RRP details: ${errorMessage}`);
            }
            finally {
                connection.release();
            }
        });
    }
    static generateRRPExcel(rrpNumber) {
        return __awaiter(this, void 0, void 0, function* () {
            try {
                (0, logger_1.logEvents)(`Generating RRP Excel for RRP number: ${rrpNumber}`, "excelServiceLog.log");
                const { rrpDetails, items, userDetails, authorityDetails, createdByUser, inspectionName, inspectionDesignation } = yield ExcelService.getRRPDetails(rrpNumber);
                const rrpType = rrpNumber.charAt(0).toUpperCase() === 'L' ? 'local' : 'foreign';
                const templatePath = path_1.default.join(__dirname, '../../public/templates/template_file.xlsx');
                const workbook = new exceljs_1.default.Workbook();
                yield workbook.xlsx.readFile(templatePath);
                const sheetName = rrpType === 'local' ? 'RRLP Template' : 'RRFP Template';
                const worksheet = workbook.getWorksheet(sheetName);
                if (!worksheet) {
                    throw new Error(`Template worksheet '${sheetName}' not found`);
                }
                const templateWorksheet = workbook.getWorksheet(sheetName);
                if (!templateWorksheet) {
                    throw new Error(`Template worksheet '${sheetName}' not found`);
                }
                worksheet.properties = Object.assign({}, templateWorksheet.properties);
                worksheet.views = templateWorksheet.views;
                worksheet.pageSetup = Object.assign({}, templateWorksheet.pageSetup);
                worksheet.headerFooter = Object.assign({}, templateWorksheet.headerFooter);
                worksheet.autoFilter = templateWorksheet.autoFilter;
                worksheet.mergeCells = templateWorksheet.mergeCells;
                templateWorksheet.columns.forEach((col, index) => {
                    if (col) {
                        const targetCol = worksheet.getColumn(index + 1);
                        targetCol.width = col.width || 8.43;
                        if (col.style) {
                            targetCol.style = col.style;
                        }
                        targetCol.hidden = col.hidden || false;
                        targetCol.outlineLevel = col.outlineLevel || 0;
                    }
                });
                templateWorksheet.eachRow((row, rowNumber) => {
                    const targetRow = worksheet.getRow(rowNumber);
                    targetRow.height = row.height || 15;
                    targetRow.hidden = row.hidden || false;
                    targetRow.outlineLevel = row.outlineLevel || 0;
                    row.eachCell((cell, colNumber) => {
                        const targetCell = worksheet.getCell(rowNumber, colNumber);
                        if (cell.style)
                            targetCell.style = cell.style;
                        if (cell.numFmt)
                            targetCell.numFmt = cell.numFmt;
                        if (cell.font)
                            targetCell.font = cell.font;
                        if (cell.alignment)
                            targetCell.alignment = cell.alignment;
                        if (cell.border)
                            targetCell.border = cell.border;
                        if (cell.fill)
                            targetCell.fill = cell.fill;
                    });
                });
                if (rrpType === 'local') {
                    const rrpNumberWithoutPrefix = rrpDetails.rrp_number.substring(1).split('T')[0].padStart(3, '0');
                    worksheet.getCell('J5').value = `RRLP: ${rrpNumberWithoutPrefix}`;
                    worksheet.getCell('J3').value = `FY: ${rrpDetails.current_fy}`;
                    const formattedDate = ExcelService.formatDate(rrpDetails.date);
                    worksheet.getCell('B5').value = formattedDate;
                    worksheet.getCell('D5').value = rrpDetails.supplier_name;
                    const freightCharge = rrpDetails.freight_charge || 0;
                    worksheet.getCell('C24').value = freightCharge < 1 ? 'NA' : freightCharge;
                    const invoiceDate = ExcelService.formatDate(rrpDetails.invoice_date);
                    worksheet.getCell('C25').value = `${rrpDetails.invoice_number || ''}(${invoiceDate})`;
                    const requestDetails = items
                        .filter(item => item.request_number && item.request_date)
                        .map(item => ({
                        number: item.request_number,
                        date: item.request_date
                    }))
                        .filter((item, index, self) => index === self.findIndex(t => t.number === item.number));
                    requestDetails.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
                    if (requestDetails.length > 0) {
                        const requestNumbers = requestDetails.map(r => r.number).join(',');
                        const earliestDate = ExcelService.formatDate(requestDetails[0].date);
                        const lastDate = ExcelService.formatDate(requestDetails[requestDetails.length - 1].date);
                        worksheet.getCell('I24').value = `${requestNumbers} (${earliestDate} - ${lastDate})`;
                    }
                    else {
                        worksheet.getCell('I24').value = '';
                    }
                    worksheet.getCell('A28').value = `${createdByUser.first_name} ${createdByUser.last_name}`;
                    worksheet.getCell('A29').value = createdByUser.designation;
                    worksheet.getCell('C28').value = inspectionName;
                    worksheet.getCell('C29').value = inspectionDesignation;
                    worksheet.getCell('E28').value = authorityDetails.level_1_authority_name;
                    worksheet.getCell('E29').value = authorityDetails.level_1_authority_designation;
                    worksheet.getCell('I28').value = authorityDetails.quality_check_authority_name;
                    worksheet.getCell('I29').value = authorityDetails.quality_check_authority_designation;
                    let currentRow = 7;
                    let sn = 1;
                    for (const item of items) {
                        const itemPrice = Number(item.item_price || 0);
                        const freightCharge = Number(item.freight_charge || 0);
                        const vatPercentage = Number(item.vat_percentage || 0);
                        const totalAmount = Number(item.total_amount || 0);
                        const vat_amount = Number(((itemPrice + Number(item.freight_charge)) * (vatPercentage / 100)).toFixed(2));
                        worksheet.getCell(`A${currentRow}`).value = sn++;
                        worksheet.getCell(`B${currentRow}`).value = item.item_name || '';
                        worksheet.getCell(`C${currentRow}`).value = item.part_number || '';
                        worksheet.getCell(`D${currentRow}`).value = item.nac_code || '';
                        worksheet.getCell(`E${currentRow}`).value = item.received_quantity || 0;
                        worksheet.getCell(`F${currentRow}`).value = item.unit || '';
                        worksheet.getCell(`G${currentRow}`).value = Number((itemPrice + freightCharge).toFixed(2));
                        worksheet.getCell(`H${currentRow}`).value = vat_amount;
                        worksheet.getCell(`I${currentRow}`).value = Number(totalAmount.toFixed(2));
                        worksheet.getCell(`J${currentRow}`).value = (0, utils_1.normalizeEquipmentNumbers)(item.equipment_number || '');
                        currentRow++;
                    }
                }
                else {
                    const formattedDate = ExcelService.formatDate(rrpDetails.date);
                    const rrpNumberWithoutPrefix = rrpDetails.rrp_number.substring(1).split('T')[0].padStart(3, '0');
                    worksheet.getCell('L4').value = `RRFP: ${rrpNumberWithoutPrefix}`;
                    worksheet.getCell('L3').value = `FY: ${rrpDetails.current_fy}`;
                    worksheet.getCell('A5').value = `DATE: ${formattedDate}`;
                    worksheet.getCell('G5').value = rrpDetails.supplier_name;
                    worksheet.getCell('C24').value = rrpDetails.customs_number || '';
                    worksheet.getCell('C25').value = ExcelService.formatDate(rrpDetails.customs_date);
                    worksheet.getCell('C26').value = rrpDetails.po_number || '';
                    worksheet.getCell('C27').value = rrpDetails.airway_bill_number || '';
                    worksheet.getCell('G25').value = rrpDetails.currency;
                    worksheet.getCell('H26').value = rrpDetails.forex_rate;
                    worksheet.getCell('J26').value = rrpDetails.invoice_number;
                    worksheet.getCell('K26').value = ExcelService.formatDate(rrpDetails.invoice_date);
                    worksheet.getCell('G6').value = `Item Total (In ${rrpDetails.currency})`;
                    worksheet.getCell('H6').value = `Freight (In ${rrpDetails.currency})`;
                    let currentRow = 7;
                    let sn = 1;
                    for (const item of items) {
                        const itemPrice = Number(item.item_price || 0);
                        const customsCharge = (Number(item.customs_charge) + Number(item.customs_service_charge) || 0);
                        const itemPlusFreight = Number(((Number(itemPrice) * Number(rrpDetails.forex_rate) || 1) + Number(item.freight_charge)).toFixed(2));
                        const finalTotal = Number((itemPlusFreight + customsCharge).toFixed(2));
                        const freightCharge = Number(item.freight_charge || 0) / Number(rrpDetails.forex_rate || 1);
                        worksheet.getCell(`A${currentRow}`).value = sn++;
                        worksheet.getCell(`B${currentRow}`).value = item.item_name || '';
                        worksheet.getCell(`C${currentRow}`).value = item.part_number || '';
                        worksheet.getCell(`D${currentRow}`).value = item.nac_code || '';
                        worksheet.getCell(`E${currentRow}`).value = item.unit || '';
                        worksheet.getCell(`F${currentRow}`).value = item.received_quantity || 0;
                        worksheet.getCell(`G${currentRow}`).value = Number(itemPrice.toFixed(2));
                        worksheet.getCell(`H${currentRow}`).value = freightCharge;
                        worksheet.getCell(`I${currentRow}`).value = itemPlusFreight;
                        worksheet.getCell(`J${currentRow}`).value = Number(customsCharge.toFixed(2));
                        worksheet.getCell(`K${currentRow}`).value = finalTotal;
                        worksheet.getCell(`L${currentRow}`).value = (0, utils_1.normalizeEquipmentNumbers)(item.equipment_number || '');
                        currentRow++;
                    }
                    worksheet.getCell('A31').value = `${createdByUser.first_name} ${createdByUser.last_name}`;
                    worksheet.getCell('A32').value = createdByUser.designation;
                    worksheet.getCell('D31').value = inspectionName || '';
                    worksheet.getCell('D32').value = inspectionDesignation || '';
                    worksheet.getCell('H31').value = authorityDetails.level_1_authority_name;
                    worksheet.getCell('H32').value = authorityDetails.level_1_authority_designation;
                    worksheet.getCell('K31').value = authorityDetails.quality_check_authority_name;
                    worksheet.getCell('K32').value = authorityDetails.quality_check_authority_designation;
                }
                // After filling in the worksheet and before returning the buffer:
                const sheetsToDelete = workbook.worksheets.filter(sheet => sheet.name !== sheetName);
                sheetsToDelete.forEach(sheet => workbook.removeWorksheet(sheet.id));
                (0, logger_1.logEvents)(`Successfully generated RRP Excel for: ${rrpNumber}`, "excelServiceLog.log");
                return yield workbook.xlsx.writeBuffer();
            }
            catch (error) {
                const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
                (0, logger_1.logEvents)(`Error generating RRP Excel for ${rrpNumber}: ${errorMessage}`, "excelServiceLog.log");
                throw new Error(`Failed to generate RRP Excel: ${errorMessage}`);
            }
        });
    }
    static generateStockCardExcel(stockData, templatePath) {
        return __awaiter(this, void 0, void 0, function* () {
            try {
                if (!stockData || stockData.length === 0) {
                    (0, logger_1.logEvents)('No stock data provided for Excel generation', "excelServiceLog.log");
                    throw new Error('No stock data provided for Excel generation');
                }
                (0, logger_1.logEvents)(`Generating stock card Excel for ${stockData.length} items`, "excelServiceLog.log");
                // Prepare the output workbook
                const outputWorkbook = new exceljs_1.default.Workbook();
                for (const stock of stockData) {
                    // Load the template for each stock item
                    const templateWorkbook = new exceljs_1.default.Workbook();
                    yield templateWorkbook.xlsx.readFile(templatePath);
                    const templateSheet = templateWorkbook.getWorksheet('Stock Card Template');
                    if (!templateSheet) {
                        (0, logger_1.logEvents)('Template worksheet not found', "excelServiceLog.log");
                        throw new Error('Template worksheet not found');
                    }
                    // Rename the template worksheet
                    templateSheet.name = `Bin Card ${stock.nac_code}`;
                    // Fill in the header and data as before
                    templateSheet.getCell('A5').value = `NAC Code: ${stock.nac_code}`;
                    templateSheet.getCell('A7').value = `Nomenclature: ${stock.item_name}`;
                    templateSheet.getCell('A8').value = `PartNo: ${stock.primary_part_number}`;
                    templateSheet.getCell('A9').value = `Alternate P/N: ${stock.secondary_part_numbers.join(', ')}`;
                    templateSheet.getCell('A10').value = `Applicable Fleet: ${stock.equipment_number}`;
                    templateSheet.getCell('J4').value = stock.card_number;
                    templateSheet.getCell('J5').value = new Date().toISOString().split('T')[0].replace(/-/g, '/');
                    templateSheet.getCell('J6').value = stock.location;
                    // Set initial balance in row 20
                    const referenceRow = templateSheet.getRow(20);
                    referenceRow.getCell('A').value = stock.openingBalanceDate.toISOString().split('T')[0].replace(/-/g, '/');
                    referenceRow.getCell('B').value = 'B.F.';
                    referenceRow.getCell('C').value = stock.open_quantity;
                    referenceRow.getCell('H').value = stock.open_quantity;
                    // Process movements, inserting new rows as needed
                    let rowIndex = 20;
                    let runningBalance = typeof stock.open_quantity === 'string'
                        ? parseFloat(stock.open_quantity) || 0
                        : (stock.open_quantity || 0);
                    let deferredIssues = [];
                    // Ensure all movements have correct types and references
                    const movements = stock.movements.map((movement) => {
                        movement.quantity = parseFloat(movement.quantity) || 0;
                        movement.amount = parseFloat(movement.amount) || 0;
                        let referenceStr = movement.reference != null ? String(movement.reference) : '';
                        if (movement.type === 'receive') {
                            referenceStr = referenceStr.indexOf('T') !== -1 ? referenceStr.split('T')[0] : referenceStr;
                        }
                        else if (movement.type === 'issue') {
                            referenceStr = referenceStr.indexOf('Y') !== -1 ? referenceStr.split('Y')[0] : referenceStr;
                        }
                        // For issues, ensure equipment number is set from issue table
                        if (movement.type === 'issue' && movement.equipment_number) {
                            movement.issued_for = movement.equipment_number;
                        }
                        movement.referenceStr = referenceStr;
                        return movement;
                    });
                    for (const movement of movements) {
                        rowIndex++;
                        templateSheet.insertRow(rowIndex, []);
                        const refRow = templateSheet.getRow(20);
                        const newRow = templateSheet.getRow(rowIndex);
                        newRow.height = refRow.height || 15;
                        newRow.hidden = refRow.hidden || false;
                        newRow.outlineLevel = refRow.outlineLevel || 0;
                        refRow.eachCell((cell, colNumber) => {
                            const newCell = newRow.getCell(colNumber);
                            if (cell.style)
                                newCell.style = cell.style;
                            if (cell.font)
                                newCell.font = cell.font;
                            if (cell.alignment)
                                newCell.alignment = cell.alignment;
                            if (cell.border)
                                newCell.border = cell.border;
                            if (cell.fill)
                                newCell.fill = cell.fill;
                            if (cell.numFmt)
                                newCell.numFmt = cell.numFmt;
                            if (cell.protection)
                                newCell.protection = cell.protection;
                        });
                        if (movement.type === 'receive') {
                            newRow.getCell('A').value = movement.date.toISOString().split('T')[0].replace(/-/g, '/');
                            newRow.getCell('B').value = movement.referenceStr;
                            newRow.getCell('C').value = movement.quantity;
                            newRow.getCell('D').value = movement.amount;
                            runningBalance += movement.quantity;
                            newRow.getCell('H').value = runningBalance;
                            // Check for deferred issues
                            if (deferredIssues.length > 0) {
                                let remainingBalance = runningBalance;
                                const issuesToProcess = [...deferredIssues];
                                deferredIssues = [];
                                for (const deferred of issuesToProcess) {
                                    if (remainingBalance >= deferred.quantity) {
                                        rowIndex++;
                                        templateSheet.insertRow(rowIndex, []);
                                        const deferredRow = templateSheet.getRow(rowIndex);
                                        deferredRow.height = refRow.height || 15;
                                        deferredRow.hidden = refRow.hidden || false;
                                        deferredRow.outlineLevel = refRow.outlineLevel || 0;
                                        refRow.eachCell((cell, colNumber) => {
                                            const newCell = deferredRow.getCell(colNumber);
                                            if (cell.style)
                                                newCell.style = cell.style;
                                            if (cell.font)
                                                newCell.font = cell.font;
                                            if (cell.alignment)
                                                newCell.alignment = cell.alignment;
                                            if (cell.border)
                                                newCell.border = cell.border;
                                            if (cell.fill)
                                                newCell.fill = cell.fill;
                                            if (cell.numFmt)
                                                newCell.numFmt = cell.numFmt;
                                            if (cell.protection)
                                                newCell.protection = cell.protection;
                                        });
                                        deferredRow.getCell('E').value = movement.date.toISOString().split('T')[0].replace(/-/g, '/');
                                        deferredRow.getCell('F').value = 'Deferred Issue';
                                        deferredRow.getCell('G').value = deferred.quantity;
                                        deferredRow.getCell('J').value = deferred.equipment;
                                        remainingBalance -= deferred.quantity;
                                        runningBalance = remainingBalance;
                                        deferredRow.getCell('H').value = runningBalance;
                                    }
                                    else if (remainingBalance > 0) {
                                        rowIndex++;
                                        templateSheet.insertRow(rowIndex, []);
                                        const deferredRow = templateSheet.getRow(rowIndex);
                                        deferredRow.height = refRow.height || 15;
                                        deferredRow.hidden = refRow.hidden || false;
                                        deferredRow.outlineLevel = refRow.outlineLevel || 0;
                                        refRow.eachCell((cell, colNumber) => {
                                            const newCell = deferredRow.getCell(colNumber);
                                            if (cell.style)
                                                newCell.style = cell.style;
                                            if (cell.font)
                                                newCell.font = cell.font;
                                            if (cell.alignment)
                                                newCell.alignment = cell.alignment;
                                            if (cell.border)
                                                newCell.border = cell.border;
                                            if (cell.fill)
                                                newCell.fill = cell.fill;
                                            if (cell.numFmt)
                                                newCell.numFmt = cell.numFmt;
                                            if (cell.protection)
                                                newCell.protection = cell.protection;
                                        });
                                        deferredRow.getCell('E').value = movement.date.toISOString().split('T')[0].replace(/-/g, '/');
                                        deferredRow.getCell('F').value = 'Deferred Issue';
                                        deferredRow.getCell('G').value = remainingBalance;
                                        deferredRow.getCell('J').value = deferred.equipment;
                                        runningBalance = 0;
                                        deferredRow.getCell('H').value = runningBalance;
                                        deferredIssues.push({
                                            quantity: deferred.quantity - remainingBalance,
                                            reference: deferred.reference,
                                            equipment: deferred.equipment
                                        });
                                        break;
                                    }
                                    else {
                                        deferredIssues.push(deferred);
                                    }
                                }
                            }
                        }
                        else {
                            if (runningBalance >= movement.quantity) {
                                newRow.getCell('E').value = movement.date.toISOString().split('T')[0].replace(/-/g, '/');
                                newRow.getCell('F').value = movement.referenceStr;
                                newRow.getCell('G').value = movement.quantity;
                                newRow.getCell('J').value = movement.issued_for || '';
                                runningBalance -= movement.quantity;
                                newRow.getCell('H').value = runningBalance;
                            }
                            else if (runningBalance > 0) {
                                newRow.getCell('E').value = movement.date.toISOString().split('T')[0].replace(/-/g, '/');
                                newRow.getCell('F').value = movement.reference;
                                newRow.getCell('G').value = runningBalance;
                                newRow.getCell('J').value = movement.issued_for || '';
                                runningBalance = 0;
                                newRow.getCell('H').value = runningBalance;
                                deferredIssues.push({
                                    quantity: movement.quantity - runningBalance,
                                    reference: movement.reference,
                                    equipment: movement.issued_for || ''
                                });
                            }
                            else {
                                deferredIssues.push({
                                    quantity: movement.quantity,
                                    reference: movement.reference,
                                    equipment: movement.issued_for || ''
                                });
                            }
                        }
                        // After setting values for D, E, F, G, I, J, K, re-apply style from reference row
                        ['D', 'E', 'F', 'G', 'I', 'J', 'K'].forEach(col => {
                            const refCell = refRow.getCell(col);
                            const newCell = newRow.getCell(col);
                            if (refCell.style)
                                newCell.style = refCell.style;
                            if (refCell.font)
                                newCell.font = refCell.font;
                            if (refCell.alignment)
                                newCell.alignment = refCell.alignment;
                            if (refCell.border)
                                newCell.border = refCell.border;
                            if (refCell.fill)
                                newCell.fill = refCell.fill;
                            if (refCell.numFmt)
                                newCell.numFmt = refCell.numFmt;
                            if (refCell.protection)
                                newCell.protection = refCell.protection;
                        });
                    }
                    templateSheet.pageSetup.printArea = `A1:K${rowIndex}`;
                    templateSheet.pageSetup.printTitlesRow = '16:18';
                    // Add the filled sheet to the output workbook
                    const newSheet = outputWorkbook.addWorksheet(templateSheet.name);
                    templateSheet.eachRow({ includeEmpty: true }, (row, rowNumber) => {
                        const newRow = newSheet.getRow(rowNumber);
                        newRow.height = row.height;
                        row.eachCell({ includeEmpty: true }, (cell, colNumber) => {
                            const newCell = newRow.getCell(colNumber);
                            newCell.value = cell.value;
                            if (cell.style)
                                newCell.style = cell.style;
                            if (cell.font)
                                newCell.font = cell.font;
                            if (cell.alignment)
                                newCell.alignment = cell.alignment;
                            if (cell.border)
                                newCell.border = cell.border;
                            if (cell.fill)
                                newCell.fill = cell.fill;
                            if (cell.numFmt)
                                newCell.numFmt = cell.numFmt;
                            if (cell.protection)
                                newCell.protection = cell.protection;
                        });
                    });
                    // Copy column widths
                    templateSheet.columns.forEach((col, idx) => {
                        if (col) {
                            const targetCol = newSheet.getColumn(idx + 1);
                            targetCol.width = col.width;
                        }
                    });
                    // Copy merged cells
                    const mergeCells = templateSheet.mergeCells;
                    if (mergeCells) {
                        const mergeRanges = mergeCells.toString().split(',');
                        mergeRanges.forEach(range => {
                            if (range) {
                                newSheet.mergeCells(range.trim());
                            }
                        });
                    }
                    // Copy auto filter if exists
                    if (templateSheet.autoFilter) {
                        newSheet.autoFilter = templateSheet.autoFilter;
                    }
                    // Copy page setup
                    newSheet.pageSetup = Object.assign({}, templateSheet.pageSetup);
                    // After copying all rows/cells from templateSheet to newSheet, explicitly re-apply all merged cell ranges from templateSheet.model.merges to newSheet to ensure header merges are preserved.
                    if (templateSheet.model && templateSheet.model.merges) {
                        templateSheet.model.merges.forEach(range => {
                            newSheet.mergeCells(range);
                        });
                    }
                }
                (0, logger_1.logEvents)(`Successfully generated stock card Excel`, "excelServiceLog.log");
                return yield outputWorkbook.xlsx.writeBuffer();
            }
            catch (error) {
                const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
                (0, logger_1.logEvents)(`Error generating stock card Excel: ${errorMessage}`, "excelServiceLog.log");
                throw new Error(`Failed to generate stock card Excel: ${errorMessage}`);
            }
        });
    }
    static applyRowFormatting(sheet, rowIndex, columns, font, alignment) {
        columns.forEach(col => {
            const cell = sheet.getCell(`${col}${rowIndex}`);
            cell.font = font;
            cell.alignment = alignment;
        });
    }
}
exports.ExcelService = ExcelService;
exports.generateRequestExcel = ExcelService.generateRequestExcel.bind(ExcelService);
exports.generateRRPExcel = ExcelService.generateRRPExcel.bind(ExcelService);
