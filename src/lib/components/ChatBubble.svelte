<script lang="ts">
	import { onMount } from 'svelte';
	
	let isOpen = false;
	let messages: any[] = [];
	let newMessage = '';
	let loading = false;
	let currentThreadId: number | null = null;
	let messagesContainer: HTMLElement;

	const API_BASE = '/api/v0/chat';

	async function getOrCreateThread() {
		try {
			const response = await fetch(`${API_BASE}/threads/`);
			
			if (!response.ok) {
				const errorData = await response.json();
				if (response.status === 401) {
					messages = [{
						id: 'auth-error-' + Date.now(),
						content: 'Please make sure you are logged in to access the chat feature.',
						sender: 'system',
						timestamp: new Date().toISOString()
					}];
					return;
				}
				throw new Error(`HTTP ${response.status}: ${errorData.error || 'Unknown error'}`);
			}
			
			const threads = await response.json();
			
			if (threads && threads.length > 0) {
				currentThreadId = threads[0].id;
				return threads[0].id;
			} else {
				const createResponse = await fetch(`${API_BASE}/threads/`, {
					method: 'POST',
					headers: { 'Content-Type': 'application/json' }
				});
				
				if (!createResponse.ok) {
					const errorText = await createResponse.text();
					throw new Error(`HTTP ${createResponse.status}: ${errorText}`);
				}
				
				const thread = await createResponse.json();
				currentThreadId = thread.id;
				return thread.id;
			}
		} catch (error) {
			messages = [{
				id: 'error-' + Date.now(),
				content: 'Unable to connect to chat service. Please check your connection and try again.',
				sender: 'system',
				timestamp: new Date().toISOString()
			}];
		}
	}

	async function loadMessages(threadId: number, page = 1) {
		try {
			loading = true;
			const timestamp = Math.floor(Date.now() / 1000);
			const response = await fetch(`${API_BASE}/threads/${threadId}/messages?page=${page}&timestamp=${timestamp}`);
			
			if (!response.ok) {
				throw new Error(`HTTP error! status: ${response.status}`);
			}
			
			const data = await response.json();
			
			let messagesList = [];
			
			if (Array.isArray(data)) {
				messagesList = data;
			} else if (data.data && Array.isArray(data.data)) {
				messagesList = data.data;
			} else if (data.messages && Array.isArray(data.messages)) {
				messagesList = data.messages;
			} else if (data.results && Array.isArray(data.results)) {
				messagesList = data.results;
			} else {
				messagesList = [];
			}
			
			const transformedMessages = messagesList.map(msg => ({
				id: msg.id,
				content: msg.body || msg.content || msg.message || '',
				sender: msg.user_id === 3 ? 'assistant' : 'user',
				timestamp: msg.created_at ? new Date(msg.created_at * 1000).toISOString() : new Date().toISOString()
			}));
			
			const reversedMessages = transformedMessages.reverse();
			
			if (page === 1) {
				messages = reversedMessages;
			} else {
				messages = [...messages, ...reversedMessages];
			}
			
			scrollToBottom();
		} catch (error) {
			if (page === 1) {
				messages = [{
					id: 'error',
					content: 'Failed to load chat history. Please try again.',
					sender: 'system',
					timestamp: new Date().toISOString()
				}];
			}
		} finally {
			loading = false;
		}
	}

	async function sendMessage() {
		if (!newMessage.trim()) return;
		
		if (!currentThreadId) {
			currentThreadId = await getOrCreateThread();
		}

		const messageText = newMessage;
		newMessage = '';

		// Add message optimistically
		messages = [...messages, {
			id: Date.now(),
			content: messageText,
			sender: 'user',
			timestamp: new Date().toISOString()
		}];
		
		scrollToBottom();

		try {
			// Send to API (adjust based on your API structure)
			const response = await fetch(`${API_BASE}/threads/${currentThreadId}/messages`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ content: messageText })
			});
			
			if (!response.ok) {
				const errorData = await response.json().catch(() => ({ error: 'Unknown error' }));
				console.error('Send message API error:', response.status, errorData);
				throw new Error(`HTTP error! status: ${response.status}, details: ${JSON.stringify(errorData)}`);
			}
			
			const result = await response.json();
			console.log('Message sent successfully:', result);
			
			// Reload messages to get server response
			await loadMessages(currentThreadId);
		} catch (error) {
			console.error('Failed to send message:', error);
			// Add error message
			messages = [...messages, {
				id: Date.now() + 1,
				content: `Failed to send message: ${error.message}. Please try again.`,
				sender: 'system',
				timestamp: new Date().toISOString()
			}];
		}
	}

	function scrollToBottom() {
		setTimeout(() => {
			if (messagesContainer) {
				messagesContainer.scrollTop = messagesContainer.scrollHeight;
			}
		}, 100);
	}

	function toggleChat() {
		isOpen = !isOpen;
		if (isOpen && !currentThreadId) {
			// Load existing thread or create new one
			getOrCreateThread().then(threadId => {
				if (threadId) loadMessages(threadId);
			});
		}
	}

	function handleKeydown(event: KeyboardEvent) {
		if (event.key === 'Enter' && !event.shiftKey) {
			event.preventDefault();
			sendMessage();
		}
	}
</script>

<!-- Chat Bubble -->
{#if !isOpen}
	<div class="fixed bottom-6 right-6 z-50">
		<button 
			class="btn btn-circle btn-secondary btn-lg shadow-lg hover:shadow-xl transition-all duration-300"
			on:click={toggleChat}
		>
			<svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
				<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z"></path>
			</svg>
		</button>
	</div>
{/if}

<!-- Chat Window -->
{#if isOpen}
	<div class="fixed bottom-6 right-6 z-50 w-96 h-[500px] bg-base-100 rounded-lg shadow-2xl border border-base-300 flex flex-col">
		<!-- Header -->
		<div class="flex items-center justify-between p-4 border-b border-base-300">
			<h3 class="font-semibold text-lg">Chat Support</h3>
			<button 
				class="btn btn-ghost btn-sm btn-circle"
				on:click={toggleChat}
			>
				<svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
					<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"></path>
				</svg>
			</button>
		</div>

		<!-- Messages -->
		<div 
			class="flex-1 overflow-y-auto p-4 space-y-3"
			bind:this={messagesContainer}
		>
			{#if loading && messages.length === 0}
				<div class="flex justify-center">
					<span class="loading loading-dots loading-md"></span>
				</div>
			{/if}

			{#each messages as message}
				<div class="chat {message.sender === 'user' ? 'chat-end' : message.sender === 'system' ? 'chat-start' : 'chat-start'}">
					<div class="chat-bubble {message.sender === 'user' ? 'chat-bubble-primary' : message.sender === 'system' ? 'chat-bubble-error' : 'chat-bubble-secondary'}">
						{message.content}
					</div>
					<div class="chat-footer opacity-50 text-xs">
						{new Date(message.timestamp).toLocaleTimeString()}
					</div>
				</div>
			{/each}
		</div>

		<!-- Input - Disabled for now -->
		<div class="p-4 border-t border-base-300">
			<div class="text-center text-sm text-base-content/60">
				Chat history is read-only
			</div>
		</div>
	</div>
{/if}
