// Utility functions extracted from reportController.ts
export function normalizeEquipmentNumbers(equipmentNumbers: string): string {
  let normalized = String(equipmentNumbers);
  normalized = normalized.replace(/\b(ge|GE)\b/g, '');
  const items = normalized.split(',').map(item => item.trim());
  const numbers: number[] = [];
  const descriptions = new Set<string>();

  for (const item of items) {
    if (/^\d+$/.test(item)) {
      numbers.push(parseInt(item, 10));
    } else {
      const cleanedItem = item.replace(/[^a-zA-Z0-9\s]/g, '').trim();
      if (cleanedItem) {
        descriptions.add(cleanedItem.toLowerCase());
      }
    }
  }

  numbers.sort((a, b) => a - b);
  const rangeNumbers: string[] = [];
  let tempRange: string[] = [];

  for (let i = 0; i < numbers.length; i++) {
    if (i === 0 || numbers[i] === numbers[i - 1] + 1) {
      tempRange.push(numbers[i].toString());
    } else {
      if (tempRange.length > 1) {
        rangeNumbers.push(`${tempRange[0]}-${tempRange[tempRange.length - 1]}`);
      } else {
        rangeNumbers.push(tempRange[0]);
      }
      tempRange = [numbers[i].toString()];
    }
  }

  if (tempRange.length > 0) {
    if (tempRange.length > 1) {
      rangeNumbers.push(`${tempRange[0]}-${tempRange[tempRange.length - 1]}`);
    } else {
      rangeNumbers.push(tempRange[0]);
    }
  }

  return [...rangeNumbers, ...Array.from(descriptions)].join(', ').toUpperCase();
}

export function processPartNumbers(partNumbers: string): { primary: string; secondary: string[] } {
  const parts = String(partNumbers).split(',').map(p => p.trim().toUpperCase());
  return {
    primary: parts[0] || '',
    secondary: parts.slice(1)
  };
}

export function processItemName(itemName: string): string {
  return String(itemName).split(',')[0].trim().toUpperCase();
} 