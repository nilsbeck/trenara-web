# Requirements Document

## Introduction

This feature adds a prediction tracking graph that displays the historical changes of "current predicted time" and "current predicted pace" over time. The graph will be displayed below the race predictions in the goal component and will only store data points when the prediction values actually change, creating an efficient tracking system that shows progress trends from goal start to current date.

## Requirements

### Requirement 1

**User Story:** As a user, I want to see a graph showing how my predicted race time and pace have changed over time, so that I can track my training progress and see if I'm improving towards my goal.

#### Acceptance Criteria

1. WHEN the goal page loads THEN the system SHALL display a line chart below the race predictions table
2. WHEN the chart renders THEN it SHALL show predicted time on the left Y-axis formatted as hours:minutes:seconds
3. WHEN the chart renders THEN it SHALL show predicted pace on the right Y-axis formatted as min/km
4. WHEN the chart renders THEN the X-axis SHALL show dates from goal start date to current date
5. WHEN prediction data exists THEN the chart SHALL display two lines showing the historical changes over time

### Requirement 2

**User Story:** As a user, I want the system to automatically track my prediction changes without storing redundant data, so that the tracking is efficient and only captures meaningful changes.

#### Acceptance Criteria

1. WHEN the goal page loads with user stats THEN the system SHALL check if current predictions differ from the last stored values
2. WHEN predicted time or pace values have changed THEN the system SHALL store a new record with the current date
3. WHEN predicted values are identical to the last stored values THEN the system SHALL NOT create a new database record
4. WHEN storing prediction data THEN the system SHALL include user_id, predicted_time, predicted_pace, and recorded_date
5. WHEN no goal is active THEN the system SHALL NOT attempt to track or display prediction data

### Requirement 3

**User Story:** As a user, I want the prediction tracking to work seamlessly with Vercel Postgres, so that my data is reliably stored and retrieved.

#### Acceptance Criteria

1. WHEN the application starts THEN the system SHALL connect to Vercel Postgres database
2. WHEN the prediction_history table doesn't exist THEN the system SHALL create it with proper schema
3. WHEN storing prediction data THEN the system SHALL use proper data types matching the source data format
4. WHEN retrieving historical data THEN the system SHALL fetch records for the current user ordered by date
5. WHEN database operations fail THEN the system SHALL handle errors gracefully without breaking the UI

### Requirement 4

**User Story:** As a user, I want the graph to be visually clear and responsive, so that I can easily understand my progress trends on any device.

#### Acceptance Criteria

1. WHEN the graph displays THEN it SHALL use a responsive chart library that works on mobile and desktop
2. WHEN the graph renders THEN it SHALL use distinct colors for time and pace lines
3. WHEN the graph has data points THEN it SHALL show tooltips with exact values and dates on hover
4. WHEN the graph has no data THEN it SHALL display a helpful message indicating tracking will begin
5. WHEN the graph loads THEN it SHALL fit properly within the existing card layout without breaking the design
