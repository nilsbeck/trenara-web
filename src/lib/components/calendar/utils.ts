import type { ChangedDateResonse, SaveScheduleResponse, Schedule } from "$lib/server/api";
import { error } from "@sveltejs/kit";

export async function postFeedback(entryId: number, feedback: number) {
    const response = await fetch('/api/v0/feedback', {
        method: 'PUT',
        body: JSON.stringify({ entryId, feedback }),
        headers: {
            'Content-Type': 'application/json'
        }
    });

    if (response.ok) {
        return { success: true, error: null };
    }
    return error(response.status, response.statusText); 
}

export async function changeDateTest(entryId: number, newDate: Date, includeFuture: boolean) {
    const response = await fetch('/api/v0/changeDateTest', {
        method: 'PUT',
        body: JSON.stringify({ entryId, newDate, includeFuture }),
        headers: {
            'Content-Type': 'application/json'
        }
    });

    if (response.ok) {
        const data = await response.json();
        return { success: true, body: data};
    }
    return error(response.status, response.statusText); 
}

export async function changeDateSave(entryId: number, newDate: Date, includeFuture: boolean): Promise<SaveScheduleResponse> {
    const response = await fetch('/api/v0/changeDateSave', {
        method: 'PUT',
        body: JSON.stringify({ entryId, newDate, includeFuture }),
        headers: {
            'Content-Type': 'application/json'
        }
    });

    if (response.ok) {
        const data = await response.json();
        return data
    }
    return error(response.status, response.statusText); 
}

export async function getMonthScheduleData(timestamp: Date) {
    const response = await fetch('/api/v0/monthSchedule/?timestamp=' + timestamp.getTime(), {
        method: 'GET',
        headers: {
            'content-type': 'application/json'
        }
    });

    return await response.json()
}

function changeSurface() {
    // TODO: needs new API call to get and populate the form fields
    // https://backend-prod.trenara.com/api/schedule/trainings/91357904
    //
    // then POST to https://backend-prod.trenara.com/api/schedule/trainings/91357904/training_condition
    //
    // {
    // 	"height_difference": "flat", // flat, light, strong, mountain
    // 	"surface": "road", // road, dirt_road, single_track, track
    // 	"height_value": 0,
    // 	"height_unit": "m"
    // }
    // const dialog = document.getElementById('my_modal_1') as HTMLDialogElement;
    // if (dialog) {
    // 	const modalBox = dialog.querySelector('.modal-box');
    // 	if (modalBox) {
    // 		// Create a new form element
    // 		const form = document.createElement('form');
    // 		formFields.forEach(field => {
    // 			let inputElement: HTMLInputElement | HTMLSelectElement | null = null;  // Initialize as null
    // 			if (field.type === 'text' || field.type === 'number') {
    // 				inputElement = document.createElement('input');
    // 				inputElement.type = field.type;
    // 				inputElement.name = field.name;
    // 				inputElement.placeholder = field.name.charAt(0).toUpperCase() + field.name.slice(1);
    // 				inputElement.value = field.value || '';
    // 				inputElement.required = true;
    // 				inputElement.className = 'input';
    // 			} else if (field.type === 'select') {
    // 				inputElement = document.createElement('select');
    // 				inputElement.name = field.name;
    // 				inputElement.className = 'input';
    // 				// Add options dynamically if needed
    // 				const options = field.value || [];
    // 				options.forEach((option: { value: string; label: string }) => {
    // 					const optionElement = document.createElement('option');
    // 					optionElement.value = option.value;
    // 					optionElement.textContent = option.label;
    // 					if (inputElement) {  // Check if inputElement is defined
    // 						inputElement.appendChild(optionElement);
    // 					}
    // 				});
    // 			}
    // 			if (inputElement) {  // Check if inputElement is defined
    // 				form.appendChild(inputElement);
    // 			}
    // 		});
    // 		const closeButton = document.createElement('button');
    // 		closeButton.type = 'button';
    // 		closeButton.textContent = 'Close';
    // 		closeButton.className = 'btn';
    // 		closeButton.onclick = () => {
    // 			dialog.close();
    // 		};
    // 		form.appendChild(closeButton);
    // 		// Append the form to the modal box
    // 		modalBox.appendChild(form);
    // 		dialog.showModal();
    // 	}
    // }
}
