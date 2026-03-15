/**
 * 記帳本相關型別定義
 * 詳細欄位可於後續需求確定後擴充
 */

export type ExpenseCategory = 'food' | 'transport' | 'shopping' | 'entertainment' | 'other';

export interface Expense {
  id: string;
  amount: number;
  category: ExpenseCategory;
  note?: string;
  date: string; // ISO 8601 format
  createdAt: string;
}

export type ExpenseFormData = Omit<Expense, 'id' | 'createdAt'>;
