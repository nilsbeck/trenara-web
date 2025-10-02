export interface ChartDataPoint {
  date: string;
  predictedTime: number; // in seconds for calculation
  predictedPace: number; // in seconds per km for calculation
  formattedTime: string; // for display
  formattedPace: string; // for display
}

export interface PredictionHistoryRecord {
  id: number;
  user_id: number;
  predicted_time: string;
  predicted_pace: string;
  recorded_at: string; // ISO date string
  created_at: string;
}

export interface ChartProps {
  data: ChartDataPoint[];
  loading?: boolean;
  error?: string | null;
  goalStartDate?: string | null;
  goalEndDate?: string | null;
}
