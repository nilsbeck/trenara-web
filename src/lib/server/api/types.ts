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
  account_created_at: number;
  active_measurement_system: string;
  can_create_team: boolean;
  can_join_team: boolean;
  can_set_goal: boolean;
  captains_team: any;
  country: string | null;
  coupled_trainees: any;
  date_of_birth: string;
  email: string;
  first_name: string;
  gender: string;
  has_garmin_export: boolean;
  has_garmin_import: boolean;
  has_nutritional_coach: boolean;
  has_polar: boolean;
  has_premium: boolean;
  has_right_on_free_trial: boolean;
  has_strava: boolean;
  height: number;
  height_unit: string;
  is_ultimate: boolean;
  is_starter: boolean;
  is_trainee: boolean;
  is_trainer: boolean;
  last_name: string;
  location: string | null;
  max_trainees: any;
  nationality: {
    id: number;
    name: string;
    flag: string;
    region: string;
    subregion: string;
    demonym: string;
    start_of_week: string;
  };
  nationality_id: number;
  pause_cause: string | null;
  paused_since: number | null;
  preferred_distance_unit_large: string;
  preferred_distance_unit_large_text: string;
  preferred_distance_unit_small: string;
  preferred_distance_unit_small_text: string;
  premium_auto_renew: boolean;
  premium_platform: string;
  premium_total_time: string;
  premium_type: string;
  premium_until: number;
  profile_picture: {
    id: number;
    path: string;
    original_path: string;
    meta: any;
    size_in_kb: number;
    created_at: number;
    custom_properties: any[];
  };
  qr_code_url: string | null;
  strength_calibration_notification_at: number | null;
  strength_calibrated: boolean;
  turnaround_heartbeat: number | null;
  uses_imperial: boolean;
  weight: number;
  weight_unit: string;
  weekly_trainings: number;
  heartbeat_prior: boolean;
  is_paused: boolean;
  trainer_picture_url: string;
  teams: any[];
  teams_awaiting_approval: any[];
  trainer: any;
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
  notification: {
    id: number;
    title: string;
    content: string;
    notification_type: string;
    metadata: {
      name: string;
      goal: string;
      goal_daily_tss: number;
      goal_pvt_tss: number;
      done_tss: number;
      type: string;
    };
    training_id: number | null;
    entry_id: number;
    medal_id: number | null;
    created_at: string;
    actions: string[];
  } | null;
  laps: Array<{
    id: number;
    order: number;
    pace_percentage: number;
    heartbeat: number;
    altitude: number;
    type: string;
    time: string;
    time_in_sec: number;
    time_value: number;
    time_unit: string;
    pace: string;
    pace_value: number;
    pace_unit: string;
    distance: string;
    distance_value: number;
    distance_unit: string;
    distance_unit_text: string;
    sum_distance: string;
    sum_distance_value: number;
    sum_distance_unit: string;
    sum_distance_unit_text: string;
  }>;
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
  type: string;
  total_messages: number;
  unread_messages: number;
  title: string;
  sub_title: string;
  picture: string;
  can_send_messages: boolean;
  last_message?: {
    id: number;
    body: string;
    url: string | null;
    user_id: number;
    picture_url: string;
    created_at: number;
  };
}

export interface Notification {
  id: number;
  title: string;
  content: string;
  notification_type: string;
  read: boolean;
  created_at: string;
  metadata?: Record<string, any>;
  training_id?: number | null;
  entry_id?: number | null;
  medal_id?: number | null;
  actions?: string[];
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

export interface ScheduledTraining {
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
  "training_condition": {
    id: number;
    height_difference: string;
    surface: string;
    updated_at: number;
    height: number | null;
    height_value: number | null;
    height_unit: string | null;
    height_unit_text: string | null;
  }
}

export interface Schedule {
  id: number;
  start_day: number;
  start_day_long: string;
  training_week: number;
  type: 'ultimate' | 'other';
  trainings: ScheduledTraining[];
  strength_trainings: StrengthTraining[];
  entries: Entry[];
}

export type DateTrainingMap = {
  // date is in the format YYYY-MM-DD
  [date: `${number}-${number}-${number}`]: {
    training?: ScheduledTraining;
    strengthTraining?: StrengthTraining;
    entry?: Entry;
  };
};

export interface Goal {
  id: number;
  name: string;
  description: string;
  start_date: string;
  end_date: string;
  can_be_edited: boolean;
  created_at: number;
  distance: string;
  distance_unit: string;
  distance_unit_text: string;
  distance_value: number;
  edit_warning: string | null;
  intermediate_goals: Array<{
    id: number;
    name: string;
    date: string;
    distance: string;
    distance_unit: string;
    distance_unit_text: string;
    distance_value: number;
    pace: string;
    pace_unit: string;
    pace_value: number;
    time: string;
    time_in_sec: number;
    time_unit: string;
    time_value: number;
    training_condition: TrainingCondition;
  }>;
  number_of_trainings: number;
  overrule_time: boolean;
  pace: string;
  pace_unit: string;
  pace_value: number;
  time: string;
  time_in_sec: number;
  time_unit: string;
  time_value: number;
  time_type_selected: string;
  training_condition: TrainingCondition;
  training_scheme_type: string;
  week: Array<{
    day: number;
    prior: number;
  }>;
  updated_at: number;
}

export interface TrainingCondition {
  id: number;
  height_difference: string | null;
  surface: string;
  height: number | null;
  height_unit: string | null;
}

export interface UserStats {
  best_times: {
    distance_unit: string;
    pace_unit: string;
    pace_for_5: string;
    time_for_5: string;
    pace_for_10: string;
    time_for_10: string;
    pace_for_half_marathon: string;
    time_for_half_marathon: string;
    pace_for_marathon: string;
    time_for_marathon: string;
    pace_for_goal: string;
    time_for_goal: string;
  };
  flat_stats: Array<{
    title: string;
    icon: string;
    data: Array<{
      title: string;
      value: string;
    }>;
  }>;
  graph_stats: {
    weeks: {
      data: Array<{
        order: number;
        day: string;
        date: string;
        is_today: boolean;
        done: string | null;
        done_value: number | null;
        done_unit: string | null;
        done_unit_text: string | null;
        todo: string | null;
        todo_value: number | null;
        todo_unit: string | null;
        todo_unit_text: string | null;
      }>;
      done: string;
      done_value: number;
      done_unit: string;
      done_unit_text: string;
      todo: string;
      todo_value: number;
      todo_unit: string;
      todo_unit_text: string;
    };
    goal: {
      data: Array<{
        week: number;
        order: number;
        month: string;
        year: number;
        is_current_week: boolean;
        done: string | null;
        done_value: number | null;
        done_unit: string | null;
        done_unit_text: string | null;
        todo: string;
        todo_value: number;
        todo_unit: string;
        todo_unit_text: string;
      }>;
      done: string;
      done_value: number;
      done_unit: string;
      done_unit_text: string;
      todo: string;
      todo_value: number;
      todo_unit: string;
      todo_unit_text: string;
    };
  };
}


