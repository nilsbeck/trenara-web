<script lang="ts">
	export { changeDateDialogSnippet }
	import changeDateIcon from '/src/assets/changeDate.svg';
	let my_modal_1: HTMLDialogElement; // Define the reference
</script>

{#snippet changeDateDialogSnippet(fromDate: Date)}
<button class="btn" onclick={() => my_modal_1.showModal()}>
	<img src={changeDateIcon} alt="change date" width="16" height="16" />
</button>
<dialog bind:this={my_modal_1} class="modal">
	<div class="modal-box">
		<h3 class="text-lg font-bold">Hello!</h3>
	<p class="py-4">Press ESC key or click the button below to close</p>
	<div class="flex flex-col md:flex-row items-start justify-center space-x-6">
		<div class="card dark:bg-gray-700 bg-gray-50 shadow-lg max-w-sm w-full flex-grow">
			<div class="card-body">
				<h1 class="text-2xl font-bold">Profile</h1>

				<!-- Personal Data Form -->
				<form>
					<fieldset class="fieldset">
						<legend class="fieldset-legend">Change Date</legend>
						<input
							type="date"
							name="fromDate"
							placeholder="From Date"
							required
							class="input"
							value={fromDate}
						/>
						<input type="date" name="toDate" placeholder="To Date" required class="input" />
						<button class="btn" type="button" onclick={() => close()}>Close</button>
						<button class="btn" type="submit">Change Date</button>
					</fieldset>
				</form>
			</div>
			</div>
		</div>
	</div>
</dialog>
{/snippet}
