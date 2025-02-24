<script lang="ts">
	import type { PageData } from './$types';
	import Loading from '$lib/components/loading.svelte';
	let { data }: { data: PageData } = $props();
</script>

{#await data.userData}
	<Loading />
{:then user}
	<div class="flex flex-col md:flex-row items-start justify-center space-x-6">
		<div class="card dark:bg-gray-700 bg-gray-50 shadow-lg max-w-sm w-full flex-grow">
			<div class="card-body">
				<h1 class="text-2xl font-bold">Profile</h1>

				<!-- Personal Data Form -->
				<form>
					<fieldset class="fieldset">
						<legend class="fieldset-legend">Personal Data</legend>
						<input
							type="text"
							name="firstName"
							placeholder="First Name"
							required
							class="input"
							bind:value={user.first_name}
						/>
						<input
							type="text"
							name="lastName"
							placeholder="Last Name"
							required
							class="input"
							bind:value={user.last_name}
						/>
						<input
							type="date"
							name="birthday"
							required
							class="input"
							bind:value={user.date_of_birth}
						/>
						<select name="country" required class="input" bind:value={user.country}>
							<option value="USA">USA</option>
							<option value="Canada">Canada</option>
							<option value="276">Germany</option>
							<!-- Add more options as needed -->
						</select>
						<select name="language" required class="input" bind:value={user.nationality.demonym}>
							<option value="English">English</option>
							<option value="Spanish">Spanish</option>
							<!-- Add more options as needed -->
						</select>
						<input
							type="email"
							name="email"
							placeholder="Email"
							required
							class="input"
							bind:value={user.email}
						/>
						<select name="gender" required class="input" bind:value={user.gender}>
							<option value="male">Male</option>
							<option value="female">Female</option>
							<option value="other">Other</option>
						</select>
					</fieldset>
					<!-- End of Personal Data Form -->

					<!-- Calculation Parameters -->
					<fieldset class="fieldset">
						<legend class="fieldset-legend">Calculation Parameters</legend>
						<input
							type="text"
							name="paceOrHeartRate"
							placeholder="Pace or Heart Rate"
							required
							class="input"
							bind:value={user.heartbeat_prior}
						/>
						<input
							type="text"
							name="lactateThresholdHR"
							placeholder="Lactate Threshold Heart Rate"
							required
							class="input"
							bind:value={user.turnaround_heartbeat}
						/>
						<select name="distanceDisplay" required class="input">
							<option value="km">Kilometers</option>
							<option value="miles">Miles</option>
						</select>
						<input
							type="number"
							name="weight"
							placeholder="Weight"
							required
							class="input"
							bind:value={user.weight}
						/>
						<input
							type="number"
							name="height"
							placeholder="Height"
							required
							class="input"
							bind:value={user.height}
						/>
					</fieldset>
				</form>
				<!-- End of Calculation Parameters -->
				<button type="submit" class="btn btn-primary mt-4">Save</button>
			</div>
		</div>
	</div>
{:catch error}
	<p>Could not load user data! {error}</p>
{/await}
