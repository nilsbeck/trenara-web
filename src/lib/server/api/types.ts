import type { RequestEvent } from "@sveltejs/kit";

export interface ApiContext {
  event?: RequestEvent;
}

export interface ApiResponse<T> {
  data: T;
  status: number;
  headers: Record<string, string>;
}

export interface User {
  id: number;
  first_name: string;
  last_name: string;
  email: string;
  gender: string;
  location: string | null;
  country: string | null;
  date_of_birth: string;
  uses_imperial: boolean;
  active_measurement_system: string;
  preferred_distance_unit_small: string;
  preferred_distance_unit_small_text: string;
  preferred_distance_unit_large: string;
  preferred_distance_unit_large_text: string;
  weight: number;
  weight_unit: string;
  height: number;
  height_unit: string;
  nationality_id: number;
  account_created_at: number;
  heartbeat_prior: boolean;
  turnaround_heartbeat: number | null;
  is_ultimate: boolean;
  is_starter: boolean;
  weekly_trainings: number;
  can_set_goal: boolean;
  has_strava: boolean;
  has_garmin_import: boolean;
  has_garmin_export: boolean;
  has_polar: boolean;
  has_premium: boolean;
  has_right_on_free_trial: boolean;
  premium_type: string;
  premium_until: number;
  premium_total_time: string;
  premium_platform: string;
  premium_auto_renew: boolean;
  is_trainee: boolean;
  trainer_picture_url: string;
  is_trainer: boolean;
  qr_code_url: string | null;
  coupled_trainees: any;
  max_trainees: any;
  can_create_team: boolean;
  can_join_team: boolean;
  is_paused: boolean;
  paused_since: number | null;
  pause_cause: string | null;
  strength_calibration_notification_at: number | null;
  strength_calibrated: boolean;
  has_nutritional_coach: boolean;
  profile_picture: string | null;
  nationality: {
    id: number;
    name: string;
    flag: string;
    region: string;
    subregion: string;
    demonym: string;
    start_of_week: string;
  };
  trainer: any;
  captains_team: any;
  teams: any[];
  teams_awaiting_approval: any[];
  training: Training;
}

export interface UserPreferences {
  notifications_enabled: boolean;
  email_notifications: boolean;
  language: string;
  timezone: string;
}

export interface Subscription {
  id: number;
  status: "active" | "inactive" | "cancelled";
  plan_id: string;
  current_period_end: string;
}

export interface Entry {
  id: number;
  name: string;
  start_time: string;
  type: string;
  icon: string;
  total_altitude: number | null;
  avg_heartbeat: number | null;
  rpe: number | null;
  comment: string | null;
  strava: boolean;
  strava_url: string | null;
  garmin: boolean;
  polar: boolean;
  trenara: boolean;
  distance: string;
  distance_value: number;
  distance_unit: string;
  distance_unit_text: string;
  time: string;
  time_in_sec: number;
  time_value: number;
  time_unit: string;
  pace: string;
  pace_value: number;
  pace_unit: string;
  gps_media: object[];
  notification: string | null;
  laps: object[];
  splits: object[];
}

export interface AuthResponse {
  access_token: string;
  refresh_token: string;
  token_type: string;
  expires_in: number;
}

export interface RegisterRequest {
  email: string;
  password: string;
  first_name: string;
  last_name: string;
}

export interface LoginRequest {
  username: string;
  password: string;
}

export interface RefreshTokenRequest {
  refresh_token: string;
}

export interface ApiError {
  message: string;
  status: number;
  errors?: Record<string, string[]>;
}

export interface Message {
  id: number;
  thread_id: number;
  sender_id: number;
  content: string;
  created_at: string;
  read_at?: string;
}

export interface Thread {
  id: number;
  title: string;
  participants: User[];
  last_message?: Message;
  unread_count: number;
}

export interface Notification {
  id: number;
  type: string;
  title: string;
  message: string;
  read: boolean;
  created_at: string;
  metadata?: Record<string, any>;
}

export interface Device {
  id: number;
  type: "ios" | "android" | "web";
  token: string;
  last_used_at: string;
}

export interface Integration {
  id: number;
  provider: "strava" | "garmin" | "polar";
  status: "connected" | "disconnected";
  last_sync_at?: string;
  metadata?: Record<string, any>;
}

export interface Exercise {
  id: number;
  type: string;
  name: string;
  howto: string;
  tips: string;
  sort: number;
  icon_image: {
    id: number;
    path: string;
    original_path: string;
    meta: any;
    size_in_kb: number;
    created_at: number;
    custom_properties: any[];
  };
  thumbnail: {
    id: number;
    path: string;
    original_path: string;
    meta: any;
    size_in_kb: number;
    created_at: number;
    custom_properties: any[];
  };
}

export interface StrengthTraining {
  id: number;
  strength_id: number | null;
  type_id: number;
  title: string;
  training_type: string;
  description: string;
  icon_url: string;
  day: string;
  time: string;
  rest_between_sets: number;
  rest_between_exercises: number;
  exercises: Exercise[];
  accessories: { id: number; name: string }[];
}

export interface TrainingPlan {
  id: number;
  name: string;
  description: string;
  duration_weeks: number;
}

export interface TrainingSession {
  id: number;
  plan_id: number;
  day: number;
  exercises: Exercise[];
}

export interface Training {
  blocks: TrainingBlock[];
  total_time_in_sec: number;
  core_time_in_sec: number;
  core_distance: string;
  core_distance_value: number;
  core_distance_unit: string;
  core_distance_unit_text: string;
  core_time: string;
  core_time_value: number;
  core_time_unit: string;
  total_distance: string;
  total_distance_value: number;
  total_distance_unit: string;
  total_distance_unit_text: string;
  total_time: string;
  total_time_value: number;
  total_time_unit: string;
}

export interface TrainingBlock {
  order: number;
  type: string;
  calc_distance_in_km?: number;
  calc_time_in_sec?: number;
  time: string;
  time_in_sec: number;
  time_value: number;
  time_unit: string;
  distance: string;
  distance_value: number;
  distance_unit: string;
  distance_unit_text: string;
  pace: string;
  pace_value: number;
  pace_unit: string;
  text: string;
  repeat?: number;
  blocks?: TrainingBlock[];
}

export interface Schedule {
  id: number;
  start_day: number;
  start_day_long: string;
  training_week: number;
  type: 'ultimate' | 'other';
  trainings: {
    id: number;
    day: number;
    day_long: string;
    title: string;
    description: string;
    show_description_from: number;
    nutritional_advice: string;
    type: string;
    icon_url: string;
    hex_training: string;
    hex_completed: string | null;
    training: {
      blocks: TrainingBlock[];
      total_time_in_sec: number;
      core_time_in_sec: number;
      core_distance: string;
      core_distance_value: number;
      core_distance_unit: string;
      core_distance_unit_text: string;
      core_time: string;
      core_time_value: number;
      core_time_unit: string;
      total_distance: string;
      total_distance_value: number;
      total_distance_unit: string;
      total_distance_unit_text: string;
      total_time: string;
      total_time_value: number;
      total_time_unit: string;
    };
    last_garmin_sync: string;
    can_be_edited: boolean;
    team_data: any;
  }[];
  strength_trainings: StrengthTraining[];
  entries: Entry[];
}
