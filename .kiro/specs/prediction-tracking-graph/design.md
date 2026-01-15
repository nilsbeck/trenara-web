# Design Document

## Overview

The prediction tracking graph feature will add a dual-axis line chart to the goal component that tracks changes in predicted race time and pace over time. The system will use Vercel Postgres to store only meaningful changes (when values actually differ), creating an efficient historical tracking system that shows training progress from goal start to present.

## Architecture

### Database Layer
- **Vercel Postgres**: Primary database for storing prediction history
- **Connection Management**: Use existing SvelteKit database patterns with connection pooling
- **Migration System**: Create database schema through SvelteKit migration approach

### API Layer
- **Prediction Tracking API**: New endpoint for storing and retrieving prediction history
- **Integration Point**: Hook into existing goal data loading to automatically track changes
- **Data Validation**: Ensure data integrity and proper formatting before storage

### Frontend Layer
- **Chart Component**: New Svelte component using Chart.js or similar library
- **Goal Component Integration**: Embed chart below existing race predictions table
- **Responsive Design**: Ensure chart works on mobile and desktop devices

## Components and Interfaces

### Database Schema

```sql
CREATE TABLE prediction_history (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL,
  predicted_time VARCHAR(20) NOT NULL,  -- Format: "HH:MM:SS"
  predicted_pace VARCHAR(20) NOT NULL,  -- Format: "MM:SS min/km"
  recorded_at DATE NOT NULL,
  created_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(user_id, recorded_at)  -- Prevent duplicate entries for same day
);

CREATE INDEX idx_prediction_history_user_date ON prediction_history(user_id, recorded_at);
```

### API Interfaces

```typescript
// New API types
export interface PredictionHistoryRecord {
  id: number;
  user_id: number;
  predicted_time: string;
  predicted_pace: string;
  recorded_at: string; // ISO date string
  created_at: string;
}

export interface PredictionTrackingRequest {
  predicted_time: string;
  predicted_pace: string;
}

export interface PredictionHistoryResponse {
  records: PredictionHistoryRecord[];
}
```

### Component Structure

```
src/lib/components/
├── goal.svelte (modified)
├── charts/
│   ├── PredictionChart.svelte (new)
│   └── types.ts (new)
└── ...

src/routes/api/v0/
├── prediction-history/
│   └── +server.ts (new)
└── ...

src/lib/server/
├── database/
│   ├── prediction-history.ts (new)
│   └── migrations/ (new)
└── ...
```

## Data Models

### Prediction History Model
```typescript
export class PredictionHistory {
  id: number;
  userId: number;
  predictedTime: string;
  predictedPace: string;
  recordedAt: Date;
  createdAt: Date;

  // Convert time format for chart display
  getTimeInSeconds(): number;
  
  // Convert pace format for chart display  
  getPaceInSeconds(): number;
  
  // Format for chart tooltips
  getFormattedTime(): string;
  getFormattedPace(): string;
}
```

### Chart Data Model
```typescript
export interface ChartDataPoint {
  date: string;
  predictedTime: number; // in seconds for calculation
  predictedPace: number; // in seconds per km for calculation
  formattedTime: string; // for display
  formattedPace: string; // for display
}

export interface ChartConfiguration {
  data: {
    labels: string[];
    datasets: [
      {
        label: 'Predicted Time';
        data: number[];
        yAxisID: 'time-axis';
        borderColor: string;
        backgroundColor: string;
      },
      {
        label: 'Predicted Pace';
        data: number[];
        yAxisID: 'pace-axis';
        borderColor: string;
        backgroundColor: string;
      }
    ];
  };
  options: ChartOptions;
}
```

## Error Handling

### Database Errors
- **Connection Failures**: Graceful degradation - show message that tracking is temporarily unavailable
- **Constraint Violations**: Handle duplicate date entries by updating existing record
- **Migration Failures**: Log errors and provide fallback behavior

### API Errors
- **Invalid Data**: Validate prediction formats before storage
- **Authentication**: Ensure user is authenticated before accessing prediction history
- **Rate Limiting**: Prevent excessive API calls during page refreshes

### Frontend Errors
- **Chart Rendering**: Show placeholder when chart library fails to load
- **Data Loading**: Display loading state and error messages appropriately
- **No Data**: Show helpful message when no prediction history exists yet

## Testing Strategy

### Unit Tests
- **Database Operations**: Test CRUD operations for prediction history
- **Data Validation**: Test prediction format validation and conversion
- **Chart Data Processing**: Test data transformation for chart display

### Integration Tests
- **API Endpoints**: Test prediction tracking and retrieval endpoints
- **Database Integration**: Test with actual Vercel Postgres connection
- **Component Integration**: Test chart component with real data

### End-to-End Tests
- **User Flow**: Test complete flow from goal page load to chart display
- **Data Persistence**: Verify predictions are stored and retrieved correctly
- **Responsive Design**: Test chart display on different screen sizes

## Implementation Approach

### Phase 1: Database Setup
1. Set up Vercel Postgres connection
2. Create prediction_history table schema
3. Implement basic CRUD operations

### Phase 2: API Development
1. Create prediction tracking endpoint
2. Implement change detection logic
3. Add data retrieval endpoint

### Phase 3: Frontend Integration
1. Create chart component using Chart.js
2. Integrate with goal component
3. Add responsive styling

### Phase 4: Testing & Polish
1. Add comprehensive tests
2. Handle edge cases and errors
3. Optimize performance and user experience

## Technical Decisions

### Chart Library Choice
**Decision**: Use Chart.js with chartjs-adapter-date-fns
**Rationale**: 
- Excellent dual-axis support
- Good mobile responsiveness
- Strong TypeScript support
- Lightweight and performant

### Data Storage Strategy
**Decision**: Store only when values change, use DATE type for recorded_at
**Rationale**:
- Efficient storage (no redundant data)
- Simple change detection
- Easy querying by date range

### Time Format Handling
**Decision**: Store as strings, convert to numbers for chart calculations
**Rationale**:
- Preserves original format from API
- Flexible for display formatting
- Avoids precision issues with time calculations
