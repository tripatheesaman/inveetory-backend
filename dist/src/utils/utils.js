"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.normalizeEquipmentNumbers = normalizeEquipmentNumbers;
exports.processPartNumbers = processPartNumbers;
exports.processItemName = processItemName;
// Utility functions extracted from reportController.ts
function normalizeEquipmentNumbers(equipmentNumbers) {
    let normalized = String(equipmentNumbers);
    normalized = normalized.replace(/\b(ge|GE)\b/g, '');
    const items = normalized.split(',').map(item => item.trim());
    const numbers = [];
    const descriptions = new Set();
    for (const item of items) {
        if (/^\d+$/.test(item)) {
            numbers.push(parseInt(item, 10));
        }
        else {
            const cleanedItem = item.replace(/[^a-zA-Z0-9\s]/g, '').trim();
            if (cleanedItem) {
                descriptions.add(cleanedItem.toLowerCase());
            }
        }
    }
    numbers.sort((a, b) => a - b);
    const rangeNumbers = [];
    let tempRange = [];
    for (let i = 0; i < numbers.length; i++) {
        if (i === 0 || numbers[i] === numbers[i - 1] + 1) {
            tempRange.push(numbers[i].toString());
        }
        else {
            if (tempRange.length > 1) {
                rangeNumbers.push(`${tempRange[0]}-${tempRange[tempRange.length - 1]}`);
            }
            else {
                rangeNumbers.push(tempRange[0]);
            }
            tempRange = [numbers[i].toString()];
        }
    }
    if (tempRange.length > 0) {
        if (tempRange.length > 1) {
            rangeNumbers.push(`${tempRange[0]}-${tempRange[tempRange.length - 1]}`);
        }
        else {
            rangeNumbers.push(tempRange[0]);
        }
    }
    return [...rangeNumbers, ...Array.from(descriptions)].join(', ').toUpperCase();
}
function processPartNumbers(partNumbers) {
    const parts = String(partNumbers).split(',').map(p => p.trim().toUpperCase());
    return {
        primary: parts[0] || '',
        secondary: parts.slice(1)
    };
}
function processItemName(itemName) {
    return String(itemName).split(',')[0].trim().toUpperCase();
}
