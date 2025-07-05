"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.formatDateForDB = exports.formatDate = void 0;
/**
 * Formats a date string or Date object to YYYY/MM/DD format
 * @param date - Date string from database, Date object, or input
 * @returns Formatted date string in YYYY/MM/DD format
 */
const formatDate = (date) => {
    if (!date)
        return null;
    const dateStr = date instanceof Date ? date.toISOString() : date;
    return dateStr.split('T')[0].replace(/-/g, '/');
};
exports.formatDate = formatDate;
/**
 * Formats a date for database insertion (YYYY-MM-DD)
 * @param date - Date string from input or Date object
 * @returns Formatted date string in YYYY-MM-DD format
 */
const formatDateForDB = (date) => {
    if (!date)
        return null;
    const dateStr = date instanceof Date ? date.toISOString() : date;
    return dateStr.split('T')[0];
};
exports.formatDateForDB = formatDateForDB;
