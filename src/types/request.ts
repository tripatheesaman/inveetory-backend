export interface RequestItem {
    nacCode: string;
    partNumber: string;
    itemName: string;
    requestQuantity: number;
    equipmentNumber: string;
    specifications: string;
    imagePath: string;
    unit?: string;
}

export interface CreateRequestDTO {
    requestDate: string;
    requestNumber: string;
    remarks: string;
    requestedBy: string;
    items: RequestItem[];
}

export interface RequestDetail {
    request_number: string;
    request_date: Date;
    part_number: string;
    item_name: string;
    unit: string;
    requested_quantity: number;
    current_balance: number | string;
    previous_rate: number | string;
    equipment_number: string;
    image_path: string;
    specifications: string;
    remarks: string;
    requested_by: string;
    approval_status: string;
} 