export interface FuelPayload {
  fuel_type: string;
  issue_date: string;
  issued_by: string;
  fuel_price: number;
  records: {
    equipment_number: string;
    kilometers: number;
    quantity: number;
    is_kilometer_reset: boolean;
  }[];
} 