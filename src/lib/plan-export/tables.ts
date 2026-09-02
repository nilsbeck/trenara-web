import type { PlanExport } from './normalize';
import { formatDuration, formatPace, toCsv } from './csv';

/**
 * The export's flat tables.
 *
 * Every numeric column is kept in its normalised machine form (km, seconds) and
 * given a human twin (`4:52` beside `292`) rather than being replaced by one.
 * A comparison wants the number; a person scanning the file wants the pace, and
 * writing both costs a column.
 */

const SESSION_COLUMNS = [
	'date',
	'training_week',
	'id',
	'title',
	'session_type',
	'cross_type',
	'total_distance_km',
	'total_time_sec',
	'total_time',
	'core_distance_km',
	'core_time_sec',
	'avg_pace_sec_per_km',
	'avg_pace',
	'block_count',
	'intensity_pct',
	'intensity_step_text',
	'distance_step_value',
	'distance_step_text',
	'has_cooldown',
	'surface',
	'suggested_shoe',
	'description'
];

const BLOCK_COLUMNS = [
	'date',
	'session_id',
	'session_title',
	'path',
	'type',
	'prior',
	'repeat',
	'repeat_context',
	'distance_km',
	'time_sec',
	'time',
	'pace_sec_per_km',
	'pace',
	'pace_range_slow_sec_per_km',
	'pace_range_fast_sec_per_km',
	'text'
];

const ENTRY_COLUMNS = [
	'date',
	'id',
	'name',
	'type',
	'cross_type',
	'distance_km',
	'time_sec',
	'time',
	'pace_sec_per_km',
	'pace',
	'avg_heartbeat',
	'total_altitude',
	'rpe',
	'source'
];

const WEEK_COLUMNS = [
	'week_start',
	'training_week',
	'type',
	'session_count',
	'planned_distance_km',
	'planned_time_sec',
	'planned_time',
	'completed_distance_km',
	'completed_time_sec'
];

export function sessionsCsv(plan: PlanExport): string {
	return toCsv(
		SESSION_COLUMNS,
		plan.sessions.map((session) => ({
			date: session.date,
			training_week: session.training_week,
			id: session.id,
			title: session.title,
			session_type: session.session_type,
			cross_type: session.cross_type,
			total_distance_km: session.total_distance_km,
			total_time_sec: session.total_time_sec,
			total_time: formatDuration(session.total_time_sec),
			core_distance_km: session.core_distance_km,
			core_time_sec: session.core_time_sec,
			avg_pace_sec_per_km: session.avg_pace_sec_per_km,
			avg_pace: formatPace(session.avg_pace_sec_per_km),
			block_count: session.blocks.length,
			intensity_pct: session.adjustments.intensity_pct,
			intensity_step_text: session.adjustments.intensity_step_text,
			distance_step_value: session.adjustments.distance_step_value,
			distance_step_text: session.adjustments.distance_step_text,
			has_cooldown: session.adjustments.has_cooldown,
			surface: session.adjustments.surface,
			suggested_shoe: session.adjustments.suggested_shoe,
			description: session.description
		}))
	);
}

export function blocksCsv(plan: PlanExport): string {
	return toCsv(
		BLOCK_COLUMNS,
		plan.sessions.flatMap((session) =>
			session.blocks.map((block) => ({
				date: session.date,
				session_id: session.id,
				session_title: session.title,
				path: block.path,
				type: block.type,
				prior: block.prior,
				repeat: block.repeat,
				repeat_context: block.repeat_context,
				distance_km: block.distance_km,
				time_sec: block.time_sec,
				time: formatDuration(block.time_sec),
				pace_sec_per_km: block.pace_sec_per_km,
				pace: formatPace(block.pace_sec_per_km),
				pace_range_slow_sec_per_km: block.pace_range_slow_sec_per_km,
				pace_range_fast_sec_per_km: block.pace_range_fast_sec_per_km,
				text: block.text
			}))
		)
	);
}

export function entriesCsv(plan: PlanExport): string {
	return toCsv(
		ENTRY_COLUMNS,
		plan.entries.map((entry) => ({
			...entry,
			time: formatDuration(entry.time_sec),
			pace: formatPace(entry.pace_sec_per_km)
		}))
	);
}

export function weeksCsv(plan: PlanExport): string {
	return toCsv(
		WEEK_COLUMNS,
		plan.weeks.map((week) => ({ ...week, planned_time: formatDuration(week.planned_time_sec) }))
	);
}
