import ExcelJS from 'exceljs';
import path from 'path';
import { RowDataPacket } from 'mysql2';
import pool from '../config/db';
import sharp from 'sharp';
import dotenv from 'dotenv';
import { logEvents } from '../middlewares/logger';

dotenv.config();

interface RequestItem extends RowDataPacket {
    nac_code: string;
    item_name: string;
    part_number: string;
    unit: string;
    requested_quantity: number;
    current_balance: number;
    previous_rate: number;
    equipment_number: string;
    specifications: string;
    image_path: string;
}

interface RequestDetails extends RowDataPacket {
    request_number: string;
    request_date: Date;
    remarks: string;
    requested_by: string;
}

interface UserDetails extends RowDataPacket {
    first_name: string;
    last_name: string;
    staff_id: string;
    designation: string;
}

interface AuthorityDetails extends RowDataPacket {
    level_1_authority_name: string;
    level_1_authority_staffid: string;
    level_1_authority_designation: string;
    level_2_authority_name: string;
    level_2_authority_staffid: string;
    level_2_authority_designation: string;
}

interface RRPItem extends RowDataPacket {
    id: number;
    rrp_number: string;
    supplier_name: string;
    date: Date;
    currency: string;
    forex_rate: number;
    item_price: number;
    customs_charge: number;
    customs_service_charge: number;
    vat_percentage: number;
    invoice_number: string;
    invoice_date: Date;
    po_number: string;
    airway_bill_number: string;
    inspection_details: string;
    approval_status: string;
    created_by: string;
    total_amount: number;
    freight_charge: number;
    customs_date: Date;
    item_name: string;
    part_number: string;
    received_quantity: number;
    unit: string;
    equipment_number: string;
}

interface RRPDetails extends RowDataPacket {
    rrp_number: string;
    date: Date;
    supplier_name: string;
    currency: string;
    forex_rate: number;
    invoice_number: string;
    invoice_date: Date;
    po_number: string;
    airway_bill_number: string;
    inspection_details: string;
    approval_status: string;
    created_by: string;
    customs_date: Date;
    customs_number: string;
}

export class ExcelService {
    private static async getRequestDetails(requestNumber: string): Promise<{
        requestDetails: RequestDetails;
        items: RequestItem[];
        userDetails: UserDetails;
        authorityDetails: AuthorityDetails;
    }> {
        const connection = await pool.getConnection();
        try {
            logEvents(`Fetching request details for request number: ${requestNumber}`, "excelServiceLog.log");

            const [requestRows] = await connection.query<RequestDetails[]>(
                'SELECT request_number, request_date, remarks, requested_by FROM request_details WHERE request_number = ? LIMIT 1',
                [requestNumber]
            );

            if (!requestRows.length) {
                logEvents(`Request not found: ${requestNumber}`, "excelServiceLog.log");
                throw new Error('Request not found');
            }

            const [itemRows] = await connection.query<RequestItem[]>(
                `SELECT nac_code, item_name, part_number, unit, requested_quantity, 
                        current_balance, previous_rate, equipment_number, specifications, image_path
                 FROM request_details 
                 WHERE request_number = ?`,
                [requestNumber]
            );

            logEvents(`Found ${itemRows.length} items for request: ${requestNumber}`, "excelServiceLog.log");

            const [userRows] = await connection.query<UserDetails[]>(
                'SELECT first_name, last_name, staffid, designation FROM users WHERE username = ?',
                [requestRows[0].requested_by]
            );

            if (!userRows.length) {
                logEvents(`User details not found for username: ${requestRows[0].requested_by}`, "excelServiceLog.log");
                throw new Error('User details not found');
            }

            const [authorityRows] = await connection.query<AuthorityDetails[]>(
                'SELECT level_1_authority_name, level_1_authority_staffid, level_1_authority_designation, ' +
                'level_2_authority_name, level_2_authority_staffid, level_2_authority_designation ' +
                'FROM authority_details ORDER BY id DESC LIMIT 1'
            );

            if (!authorityRows.length) {
                logEvents('Authority details not found', "excelServiceLog.log");
                throw new Error('Authority details not found');
            }

            logEvents(`Successfully fetched all details for request: ${requestNumber}`, "excelServiceLog.log");
            return {
                requestDetails: requestRows[0],
                items: itemRows,
                userDetails: userRows[0],
                authorityDetails: authorityRows[0]
            };
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
            logEvents(`Error fetching request details for ${requestNumber}: ${errorMessage}`, "excelServiceLog.log");
            throw new Error(`Failed to fetch request details: ${errorMessage}`);
        } finally {
            connection.release();
        }
    }

    private static formatDate(date: Date | string | null | undefined): string {
        if (!date) return '';
        const dateObj = typeof date === 'string' ? new Date(date) : date;
        return dateObj.toISOString().split('T')[0].replace(/-/g, '/');
    }

    private static async resizeImage(imagePath: string, maxWidth = 120, maxHeight = 100): Promise<Buffer> {
        try {
            logEvents(`Resizing image: ${imagePath}`, "excelServiceLog.log");
            const frontendUrl = process.env.CORS_ORIGIN || 'http://localhost:3000';
            const imageUrl = `${frontendUrl}${imagePath}`;
            
            const response = await fetch(imageUrl);
            if (!response.ok) {
                throw new Error(`Failed to fetch image from frontend: ${imageUrl}`);
            }

            const arrayBuffer = await response.arrayBuffer();
            const buffer = Buffer.from(arrayBuffer);
            
            const resizedBuffer = await sharp(buffer)
                .resize(maxWidth, maxHeight, { fit: 'inside', background: { r: 255, g: 255, b: 255, alpha: 1 } })
                .toBuffer();

            logEvents(`Successfully resized image: ${imagePath}`, "excelServiceLog.log");
            return resizedBuffer;
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
            logEvents(`Error resizing image ${imagePath}: ${errorMessage}`, "excelServiceLog.log");
            return Buffer.from('');
        }
    }

    public static async generateRequestExcel(requestNumber: string): Promise<ExcelJS.Buffer> {
        try {
            logEvents(`Generating request Excel for request number: ${requestNumber}`, "excelServiceLog.log");
            
            const { requestDetails, items, userDetails, authorityDetails } = await ExcelService.getRequestDetails(requestNumber);
        const templatePath = path.join(__dirname, '../../public/templates/template_file.xlsx');
        
        const workbook = new ExcelJS.Workbook();
        await workbook.xlsx.readFile(templatePath);
        
        const worksheet = workbook.getWorksheet('Request Template');
        if (!worksheet) {
            throw new Error('Template worksheet not found');
        }

            const templateWorksheet = workbook.getWorksheet('Request Template');
            if (!templateWorksheet) {
                throw new Error('Template worksheet not found');
            }

            worksheet.properties = { ...templateWorksheet.properties };
            worksheet.views = templateWorksheet.views;
            worksheet.pageSetup = { ...templateWorksheet.pageSetup };
            worksheet.headerFooter = { ...templateWorksheet.headerFooter };
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
                    if (cell.style) targetCell.style = cell.style;
                    if (cell.numFmt) targetCell.numFmt = cell.numFmt;
                    if (cell.font) targetCell.font = cell.font;
                    if (cell.alignment) targetCell.alignment = cell.alignment;
                    if (cell.border) targetCell.border = cell.border;
                    if (cell.fill) targetCell.fill = cell.fill;
                });
            });

            const formattedDate = ExcelService.formatDate(requestDetails.request_date);
        worksheet.getCell('C7').value = `${requestDetails.request_number}(${formattedDate})`;

        let currentRow = 10;
        let specificationsText = '';
            let imagePlaced = false;
            let imageBuffer: Buffer | null = null;
        for (const item of items) {
            worksheet.getCell(`B${currentRow}`).value = item.nac_code;
            worksheet.getCell(`C${currentRow}`).value = item.item_name;
            worksheet.getCell(`D${currentRow}`).value = item.part_number;
            worksheet.getCell(`E${currentRow}`).value = item.unit;
            worksheet.getCell(`F${currentRow}`).value = item.requested_quantity;
            worksheet.getCell(`G${currentRow}`).value = item.current_balance;
            worksheet.getCell(`H${currentRow}`).value = item.previous_rate;
            worksheet.getCell(`I${currentRow}`).value = item.equipment_number;
                specificationsText += `${item.nac_code}:${item.specifications}\n`;

                if (!imagePlaced && item.image_path) {
                    imageBuffer = await ExcelService.resizeImage(item.image_path);
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
                    const imageBuffer = await ExcelService.resizeImage(item.image_path, imageWidthPx, imageHeightPx);
                    
                if (imageBuffer.length > 0) {
                    const imageId = workbook.addImage({
                        buffer: imageBuffer,
                        extension: 'png'
                    });

                        let imagePosition;
                        if (i === 0) {
                            imagePosition = initialSpacing;
                        } else {
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

            logEvents(`Successfully generated request Excel for: ${requestNumber}`, "excelServiceLog.log");
            return await workbook.xlsx.writeBuffer();
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
            logEvents(`Error generating request Excel for ${requestNumber}: ${errorMessage}`, "excelServiceLog.log");
            throw new Error(`Failed to generate request Excel: ${errorMessage}`);
        }
    }

    private static async getRRPDetails(rrpNumber: string): Promise<{
        rrpDetails: RRPDetails;
        items: RRPItem[];
        userDetails: UserDetails;
        authorityDetails: AuthorityDetails;
        createdByUser: UserDetails;
        inspectionName: string;
        inspectionDesignation: string;
    }> {
        const connection = await pool.getConnection();
        try {
            logEvents(`Fetching RRP details for RRP number: ${rrpNumber}`, "excelServiceLog.log");

            const [rrpRows] = await connection.query<RRPDetails[]>(
                `SELECT rrp_number, date, supplier_name, currency, forex_rate, 
                        invoice_number, invoice_date, po_number, airway_bill_number, 
                        inspection_details, approval_status, created_by, customs_date, customs_number, current_fy 
                 FROM rrp_details 
                 WHERE rrp_number = ? 
                 LIMIT 1`,
                [rrpNumber]
            );

            if (!rrpRows.length) {
                logEvents(`RRP not found: ${rrpNumber}`, "excelServiceLog.log");
                throw new Error('RRP not found');
            }

            const [itemRows] = await connection.query<RRPItem[]>(
                `SELECT rd.id, rd.rrp_number, rd.supplier_name, rd.date, rd.currency, rd.forex_rate,
                        rd.item_price, rd.customs_charge, rd.customs_service_charge, rd.vat_percentage,
                        rd.invoice_number, rd.invoice_date, rd.po_number, rd.airway_bill_number,
                        rd.inspection_details, rd.approval_status, rd.created_by, rd.total_amount,
                        rd.freight_charge, rd.customs_date, rd.customs_number, red.item_name, red.part_number,
                        red.received_quantity, red.unit, rqd.equipment_number, red.nac_code, rqd.request_number, rqd.request_date
                 FROM rrp_details rd
                 JOIN receive_details red ON rd.receive_fk = red.id
                 JOIN request_details rqd ON red.request_fk = rqd.id
                 WHERE rd.rrp_number = ?`,
                [rrpNumber]
            );

            const [userRows] = await connection.query<UserDetails[]>(
                'SELECT first_name, last_name, staffid, designation FROM users WHERE username = ?',
                [rrpRows[0].created_by]
            );

            if (!userRows.length) {
                logEvents(`User details not found for username: ${rrpRows[0].created_by}`, "excelServiceLog.log");
                throw new Error('User details not found');
            }

            const [createdByUserRows] = await connection.query<UserDetails[]>(
                'SELECT first_name, last_name, staffid, designation FROM users WHERE username = ?',
                [rrpRows[0].created_by]
            );

            if (!createdByUserRows.length) {
                logEvents(`Created by user details not found for username: ${rrpRows[0].created_by}`, "excelServiceLog.log");
                throw new Error('Created by user details not found');
            }

            const [authorityRows] = await connection.query<AuthorityDetails[]>(
                'SELECT level_1_authority_name, level_1_authority_staffid, level_1_authority_designation, ' +
                'quality_check_authority_name, quality_check_authority_staffid, quality_check_authority_designation ' +
                'FROM authority_details WHERE authority_type = ? ORDER BY id DESC LIMIT 1',
                ['rrp']
            );

            if (!authorityRows.length) {
                logEvents('Authority details not found', "excelServiceLog.log");
                throw new Error('Authority details not found');
            }

            const inspectionDetails = JSON.parse(rrpRows[0].inspection_details);
            const inspectionUser = inspectionDetails.inspection_user || '';
            const [inspectionName, ...designationParts] = inspectionUser.split(',');
            const inspectionDesignation = designationParts.join(',').trim();

            logEvents(`Successfully fetched all RRP details for: ${rrpNumber}`, "excelServiceLog.log");
            return {
                rrpDetails: rrpRows[0],
                items: itemRows,
                userDetails: userRows[0],
                authorityDetails: authorityRows[0],
                createdByUser: createdByUserRows[0],
                inspectionName,
                inspectionDesignation,
            };
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
            logEvents(`Error fetching RRP details for ${rrpNumber}: ${errorMessage}`, "excelServiceLog.log");
            throw new Error(`Failed to fetch RRP details: ${errorMessage}`);
        } finally {
            connection.release();
        }
    }

    public static async generateRRPExcel(rrpNumber: string): Promise<ExcelJS.Buffer> {
        try {
            logEvents(`Generating RRP Excel for RRP number: ${rrpNumber}`, "excelServiceLog.log");
            
            const { rrpDetails, items, userDetails, authorityDetails, createdByUser, inspectionName, inspectionDesignation } = 
                await ExcelService.getRRPDetails(rrpNumber);

            const rrpType = rrpNumber.charAt(0).toUpperCase() === 'L' ? 'local' : 'foreign';
            const templatePath = path.join(__dirname, '../../public/templates/template_file.xlsx');
            
            const workbook = new ExcelJS.Workbook();
            await workbook.xlsx.readFile(templatePath);
            
            const sheetName = rrpType === 'local' ? 'RRLP Template' : 'RRFP Template';
            const worksheet = workbook.getWorksheet(sheetName);
            if (!worksheet) {
                throw new Error(`Template worksheet '${sheetName}' not found`);
            }

            const templateWorksheet = workbook.getWorksheet(sheetName);
            if (!templateWorksheet) {
                throw new Error(`Template worksheet '${sheetName}' not found`);
            }

            worksheet.properties = { ...templateWorksheet.properties };
            worksheet.views = templateWorksheet.views;
            worksheet.pageSetup = { ...templateWorksheet.pageSetup };
            worksheet.headerFooter = { ...templateWorksheet.headerFooter };
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
                    if (cell.style) targetCell.style = cell.style;
                    if (cell.numFmt) targetCell.numFmt = cell.numFmt;
                    if (cell.font) targetCell.font = cell.font;
                    if (cell.alignment) targetCell.alignment = cell.alignment;
                    if (cell.border) targetCell.border = cell.border;
                    if (cell.fill) targetCell.fill = cell.fill;
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
                    .filter((item, index, self) => 
                        index === self.findIndex(t => t.number === item.number)
                    );

                requestDetails.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

                if (requestDetails.length > 0) {
                    const requestNumbers = requestDetails.map(r => r.number).join(',');
                    const earliestDate = ExcelService.formatDate(requestDetails[0].date);
                    const lastDate = ExcelService.formatDate(requestDetails[requestDetails.length - 1].date);
                    worksheet.getCell('I24').value = `${requestNumbers} (${earliestDate} - ${lastDate})`;
                } else {
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
                    worksheet.getCell(`J${currentRow}`).value = item.equipment_number || '';
                    currentRow++;
                }
            } else {
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
                    const itemPlusFreight = Number(((Number(itemPrice)*Number(rrpDetails.forex_rate) || 1) + Number(item.freight_charge)).toFixed(2));
                    const finalTotal = Number((itemPlusFreight + customsCharge).toFixed(2));
                    const freightCharge = Number(item.freight_charge || 0)/Number(rrpDetails.forex_rate || 1);
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
                    worksheet.getCell(`L${currentRow}`).value = item.equipment_number || '';
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

            logEvents(`Successfully generated RRP Excel for: ${rrpNumber}`, "excelServiceLog.log");
        return await workbook.xlsx.writeBuffer();
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
            logEvents(`Error generating RRP Excel for ${rrpNumber}: ${errorMessage}`, "excelServiceLog.log");
            throw new Error(`Failed to generate RRP Excel: ${errorMessage}`);
        }
    }
}

export const generateRequestExcel = ExcelService.generateRequestExcel.bind(ExcelService);
export const generateRRPExcel = ExcelService.generateRRPExcel.bind(ExcelService);