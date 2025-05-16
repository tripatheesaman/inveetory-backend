/**
 * Formats a date string or Date object to YYYY/MM/DD format
 * @param date - Date string from database, Date object, or input
 * @returns Formatted date string in YYYY/MM/DD format
 */
export const formatDate = (date: string | Date | null | undefined): string | null => {
    if (!date) return null;
    const dateStr = date instanceof Date ? date.toISOString() : date;
    return dateStr.split('T')[0].replace(/-/g, '/');
};

/**
 * Formats a date for database insertion (YYYY-MM-DD)
 * @param date - Date string from input or Date object
 * @returns Formatted date string in YYYY-MM-DD format
 */
export const formatDateForDB = (date: string | Date | null | undefined): string | null => {
    if (!date) return null;
    const dateStr = date instanceof Date ? date.toISOString() : date;
    return dateStr.split('T')[0];
}; 