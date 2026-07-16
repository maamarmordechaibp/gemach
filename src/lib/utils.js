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

// A loan is overdue when it is not fully paid and its due date has passed.
// Overdue is derived from the due date rather than a stored status, since the
// status column is not automatically flipped to "overdue" over time.
export function isLoanOverdue(loan) {
	if (!loan || loan.status === 'paid') return false;
	if (!loan.due_date) return false;
	const today = new Date();
	today.setHours(0, 0, 0, 0);
	return new Date(loan.due_date) < today;
}