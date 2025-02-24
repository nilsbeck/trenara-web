<script lang="ts">
	import type { Goal, UserStats } from '$lib/server/api/types';
    let { goal, userStats }: { goal: Goal, userStats: UserStats } = $props();
    let timeProgressValue = $state(0);

	// Function to calculate progress
	function calculateProgress() {
		if (goal && goal.start_date && goal.end_date) {
			const startDate = new Date(goal.start_date);
			const endDate = new Date(goal.end_date);
			const today = new Date();

			const totalDays = (endDate.getTime() - startDate.getTime()) / (1000 * 3600 * 24);
			const daysPassed = (today.getTime() - startDate.getTime()) / (1000 * 3600 * 24);
			timeProgressValue = Math.min(Math.max((daysPassed / totalDays) * 100, 0), 100);
		}
	}

	// Watch for changes in goal
	$effect(() => {
		calculateProgress();
	});
</script>

<div class="card dark:bg-gray-700 bg-gray-50 shadow-lg max-w-sm w-full flex-grow">
    <div class="card-body">
        <h2 class="card-title">Event: {goal.name}</h2>
        <p>Distance: {goal.distance}</p>
        <table class="table w-full">
            <thead>
                <tr>
                    <th></th>
                    <th>Goal</th>
                    <th>Current Prediction</th>
                </tr>
            </thead>
            <tbody>
                <tr>
                    <td>Pace</td>
                    <td>{goal.pace}</td>
                    <td>{userStats.best_times.pace_for_goal}</td>
                </tr>
                <tr>
                    <td>Time</td>
                    <td>{goal.time}h</td>
                    <td>{userStats.best_times.time_for_goal}h</td>
                </tr>
            </tbody>
        </table>
        <p>Time to goal:</p>
        <progress class="progress progress-secondary w-full border border-light-gray" value={timeProgressValue} max="100"></progress>
    </div>
</div>
