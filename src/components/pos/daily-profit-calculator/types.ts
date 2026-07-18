export interface DailyRecord {
  id: string;
  date: string;
  sales: number;
  expenses: number;
  profit: number;
  notes?: string | null;
  createdAt?: string;
  updatedAt?: string;
}
