import { clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs) {
	return twMerge(clsx(inputs));
}

// Format a number as currency with thousands separators and 2 decimals.
// Returns the numeric part only (no $ sign), e.g. 1000 -> "1,000.00".
export function formatCurrency(amount) {
	const num = parseFloat(amount);
	if (isNaN(num)) return '0.00';
	return num.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}