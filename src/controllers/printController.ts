import { Request, Response } from 'express';
import { generateRequestExcel, generateRRPExcel } from '../services/excelService';

export const printRequest = async (req: Request, res: Response): Promise<void> => {
    try {
        const { requestNumber } = req.params;
        
        if (!requestNumber) {
            res.status(400).json({ 
                error: 'Bad Request',
                message: 'Request number is required' 
            });
            return;
        }

        const excelBuffer = await generateRequestExcel(requestNumber);
        
        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        res.setHeader('Content-Disposition', `attachment; filename=request_${requestNumber}.xlsx`);
        res.send(excelBuffer);
    } catch (error) {
        console.error('Error generating Excel:', error);
        res.status(500).json({ 
            error: 'Internal Server Error',
            message: error instanceof Error ? error.message : 'An error occurred while generating the Excel file'
        });
    }
};

export const printRRP = async (req: Request, res: Response): Promise<void> => {
    try {
        const { rrpNumber } = req.params;
        
        if (!rrpNumber) {
            res.status(400).json({ 
                error: 'Bad Request',
                message: 'RRP number is required' 
            });
            return;
        }

        const excelBuffer = await generateRRPExcel(rrpNumber);
        
        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        res.setHeader('Content-Disposition', `attachment; filename=rrp_${rrpNumber}.xlsx`);
        res.send(excelBuffer);
    } catch (error) {
        console.error('Error generating Excel:', error);
        res.status(500).json({ 
            error: 'Internal Server Error',
            message: error instanceof Error ? error.message : 'An error occurred while generating the Excel file'
        });
    }
}; 