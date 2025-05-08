import ExcelJS from 'exceljs';
import path from 'path';
import { RowDataPacket } from 'mysql2';
import pool from '../config/db';
import sharp from 'sharp';
import dotenv from 'dotenv';

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
    requested_by: string; // username of the person who prepared the request
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

export class ExcelService {
    private static async getRequestDetails(requestNumber: string): Promise<{
        requestDetails: RequestDetails;
        items: RequestItem[];
        userDetails: UserDetails;
        authorityDetails: AuthorityDetails;
    }> {
        const connection = await pool.getConnection();
        try {
            const [requestRows] = await connection.query<RequestDetails[]>(
                'SELECT request_number, request_date, remarks, requested_by FROM request_details WHERE request_number = ? LIMIT 1',
                [requestNumber]
            );

            const [itemRows] = await connection.query<RequestItem[]>(
                `SELECT nac_code, item_name, part_number, unit, requested_quantity, 
                        current_balance, previous_rate, equipment_number, specifications, image_path
                 FROM request_details 
                 WHERE request_number = ?`,
                [requestNumber]
            );

            if (!requestRows.length) {
                throw new Error('Request not found');
            }

            // Get user details using username
            const [userRows] = await connection.query<UserDetails[]>(
                'SELECT first_name, last_name, staffid, designation FROM users WHERE username = ?',
                [requestRows[0].requested_by]
            );

            if (!userRows.length) {
                throw new Error('User details not found');
            }

            // Get authority details
            const [authorityRows] = await connection.query<AuthorityDetails[]>(
                'SELECT level_1_authority_name, level_1_authority_staffid, level_1_authority_designation, ' +
                'level_2_authority_name, level_2_authority_staffid, level_2_authority_designation ' +
                'FROM authority_details ORDER BY id DESC LIMIT 1'
            );

            if (!authorityRows.length) {
                throw new Error('Authority details not found');
            }

            return {
                requestDetails: requestRows[0],
                items: itemRows,
                userDetails: userRows[0],
                authorityDetails: authorityRows[0]
            };
        } finally {
            connection.release();
        }
    }

    private static formatDate(date: Date): string {
        return date.toISOString().split('T')[0].replace(/-/g, '/');
    }

    private static async resizeImage(imagePath: string, maxWidth = 120, maxHeight = 100): Promise<Buffer> {
        try {
            const frontendUrl = process.env.CORS_ORIGIN || 'http://localhost:3000';
            const imageUrl = `${frontendUrl}${imagePath}`;
            const response = await fetch(imageUrl);
            if (!response.ok) {
                throw new Error(`Failed to fetch image from frontend: ${imageUrl}`);
            }
            const arrayBuffer = await response.arrayBuffer();
            const buffer = Buffer.from(arrayBuffer);
            // Resize image to fit inside maxWidth x maxHeight, keep aspect ratio
            return await sharp(buffer)
                .resize(maxWidth, maxHeight, { fit: 'inside', background: { r: 255, g: 255, b: 255, alpha: 1 } })
                .toBuffer();
        } catch (error) {
            console.error('Error resizing image:', error);
            return Buffer.from('');
        }
    }

    public static async generateRequestExcel(requestNumber: string): Promise<ExcelJS.Buffer> {
        const { requestDetails, items, userDetails, authorityDetails } = await ExcelService.getRequestDetails(requestNumber);
        const templatePath = path.join(__dirname, '../../public/templates/template_file.xlsx');
        
        const workbook = new ExcelJS.Workbook();
        await workbook.xlsx.readFile(templatePath);
        
        const worksheet = workbook.getWorksheet('Request Template');
        if (!worksheet) {
            throw new Error('Template worksheet not found');
        }

        // Copy all properties from template
        const templateWorksheet = workbook.getWorksheet('Request Template');
        if (!templateWorksheet) {
            throw new Error('Template worksheet not found');
        }

        // Copy all properties, styles, and layouts
        worksheet.properties = { ...templateWorksheet.properties };
        worksheet.views = templateWorksheet.views;
        worksheet.pageSetup = { ...templateWorksheet.pageSetup };
        worksheet.headerFooter = { ...templateWorksheet.headerFooter };
        worksheet.autoFilter = templateWorksheet.autoFilter;
        worksheet.mergeCells = templateWorksheet.mergeCells;

        // Copy column properties
        templateWorksheet.columns.forEach((col, index) => {
            if (col) {
                const targetCol = worksheet.getColumn(index + 1);
                targetCol.width = col.width || 8.43; // Default width if undefined
                if (col.style) {
                    targetCol.style = col.style;
                }
                targetCol.hidden = col.hidden || false;
                targetCol.outlineLevel = col.outlineLevel || 0;
            }
        });

        // Copy row properties and cell styles
        templateWorksheet.eachRow((row, rowNumber) => {
            const targetRow = worksheet.getRow(rowNumber);
            targetRow.height = row.height || 15; // Default height if undefined
            targetRow.hidden = row.hidden || false;
            targetRow.outlineLevel = row.outlineLevel || 0;

            // Copy cell styles and values
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

        // Set request number and date in C7
        const formattedDate = ExcelService.formatDate(requestDetails.request_date);
        worksheet.getCell('C7').value = `${requestDetails.request_number}(${formattedDate})`;

        // Insert items starting from row 10
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

        // Place specifications text in the already-merged cell A13 (A13:H13)
        worksheet.getCell('A14').value = specificationsText.trim();
        worksheet.getCell('A14').alignment = { vertical: 'top', wrapText: true };
        worksheet.getCell('I14').value =requestDetails.remarks.trim() ? requestDetails.remarks.trim() : "";
        // Place all images in the specifications area (A13:H13), horizontally in row 14, using template's column widths
        const imageWidthPx = 200;
        const imageHeightPx = 100;
        const startCol = 0; // A
        const endCol = 7;   // H
        const EMU = 9525;
        
        // Calculate total available width in pixels
        let totalWidthPx = 0;
        for (let c = startCol; c <= endCol; c++) {
            const colWidth = worksheet.getColumn(c + 1).width || 8.43;
            totalWidthPx += colWidth * 7;
        }

        const imageItems = items.filter(item => item.image_path);
        const imageCount = imageItems.length;
        
        if (imageCount > 0) {
            // Calculate spacing to distribute images evenly
            const totalImageWidth = imageCount * imageWidthPx;
            const totalSpacing = totalWidthPx - totalImageWidth;
            
            // Use a smaller initial spacing and larger between-image spacing
            const initialSpacing = totalSpacing * 0.2; // 20% of total spacing for initial gap
            const remainingSpacing = totalSpacing - initialSpacing;
            const spacingBetweenImages = remainingSpacing / (imageCount - 1); // Distribute remaining space between images
            
            // Position each image
            for (let i = 0; i < imageCount; i++) {
                const item = imageItems[i];
                const imageBuffer = await ExcelService.resizeImage(item.image_path, imageWidthPx, imageHeightPx);
                
                if (imageBuffer.length > 0) {
                    const imageId = workbook.addImage({
                        buffer: imageBuffer,
                        extension: 'png'
                    });

                    // Calculate position for this image
                    let imagePosition;
                    if (i === 0) {
                        imagePosition = initialSpacing; // First image position
                    } else {
                        imagePosition = initialSpacing + (i * imageWidthPx) + (i * spacingBetweenImages);
                    }
                    
                    // Find which column this position falls into
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

        // Insert user details (Request Prepared By)
        worksheet.getCell('A20').value = `${userDetails.first_name} ${userDetails.last_name}`;
        worksheet.getCell('A21').value = userDetails.staff_id;
        worksheet.getCell('A22').value = userDetails.designation;

        // Insert Level 1 authority details
        worksheet.getCell('D20').value = authorityDetails.level_1_authority_name;
        worksheet.getCell('D21').value = authorityDetails.level_1_authority_staffid;
        worksheet.getCell('D22').value = authorityDetails.level_1_authority_designation;

        // Insert Level 2 authority details
        worksheet.getCell('I20').value = authorityDetails.level_2_authority_name;
        worksheet.getCell('I21').value = authorityDetails.level_2_authority_staffid;
        worksheet.getCell('I22').value = authorityDetails.level_2_authority_designation;

        // Debug: Log the column widths of columns A-H after loading the worksheet
        for (let c = 1; c <= 8; c++) {
            console.log(`Column ${String.fromCharCode(64 + c)} width:`, worksheet.getColumn(c).width);
        }

        // Generate buffer
        return await workbook.xlsx.writeBuffer();
    }
}

export const generateRequestExcel = ExcelService.generateRequestExcel.bind(ExcelService);