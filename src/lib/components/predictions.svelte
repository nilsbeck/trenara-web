<script lang="ts">
	import type { UserStats } from '$lib/server/api/types';
    let { userStats }: { userStats: UserStats } = $props();
    let timeProgressValue = $state(0);
</script>

<div class="card dark:bg-gray-700 bg-gray-50 shadow-lg max-w-sm min-w-sm w-full">
    <div class="card-body">
        <h2 class="card-title">Race predictions</h2>
        <table class="table w-full">
            <thead>
                <tr>
                    <th>Distance</th>
                    <th>Time</th>
                    <th>Pace</th>
                </tr>
            </thead>
            <tbody>
                <tr>
                    <td>5km</td>
                    <td>{userStats.best_times.time_for_5}h</td>
                    <td>{userStats.best_times.pace_for_5}</td>
                </tr>
                <tr>
                    <td>10km</td>
                    <td>{userStats.best_times.time_for_10}h</td>
                    <td>{userStats.best_times.pace_for_10}</td>
                </tr>
                <tr>
                    <td>21km</td>
                    <td>{userStats.best_times.time_for_half_marathon}h</td>
                    <td>{userStats.best_times.pace_for_half_marathon}</td>
                </tr>
                <tr>
                    <td>42km</td>
                    <td>{userStats.best_times.time_for_marathon}h</td>
                    <td>{userStats.best_times.pace_for_marathon}</td>
                </tr>
            </tbody>
        </table>
    </div>
</div>
