/**
 * Standalone Reticulum LXMF Web Client
 * Direct WebSocket connection to Reticulum service
 */

class ReticulumClient {
    constructor() {
        this.ws = null;
        this.connected = false;
        this.reconnectAttempts = 0;
        this.maxReconnectAttempts = 5;
        this.currentDestination = null;
        this.messages = [];
        this.peers = new Map();
        this.status = null;

        this.initializeUI();
        this.attachEventListeners();

        // Auto-detect WebSocket URL
        const hostname = window.location.hostname || 'localhost';
        const wsUrl = `ws://${hostname}:4243`;
        document.getElementById('wsUrlInput').value = wsUrl;

        this.log('Ready to connect', 'info');
    }

    initializeUI() {
        // Initialize UI elements
        this.elements = {
            // Connection
            connectBtn: document.getElementById('connectBtn'),
            disconnectBtn: document.getElementById('disconnectBtn'),
            wsUrlInput: document.getElementById('wsUrlInput'),
            statusDot: document.getElementById('statusDot'),
            statusText: document.getElementById('statusText'),

            // Identity
            identityHash: document.getElementById('identityHash'),
            destinationHash: document.getElementById('destinationHash'),
            displayName: document.getElementById('displayName'),
            announceBtn: document.getElementById('announceBtn'),

            // Peers
            peersList: document.getElementById('peersList'),
            customDest: document.getElementById('customDest'),
            useCustomDestBtn: document.getElementById('useCustomDestBtn'),

            // Chat
            chatTitle: document.getElementById('chatTitle'),
            messagesContainer: document.getElementById('messagesContainer'),
            messageInput: document.getElementById('messageInput'),
            sendBtn: document.getElementById('sendBtn'),
            clearChatBtn: document.getElementById('clearChatBtn'),

            // Debug
            debugLog: document.getElementById('debugLog'),
            clearLogBtn: document.getElementById('clearLogBtn')
        };
    }

    attachEventListeners() {
        // Connection
        this.elements.connectBtn.addEventListener('click', () => this.connect());
        this.elements.disconnectBtn.addEventListener('click', () => this.disconnect());

        // Actions
        this.elements.announceBtn.addEventListener('click', () => this.sendAnnounce());
        this.elements.sendBtn.addEventListener('click', () => this.sendMessage());
        this.elements.useCustomDestBtn.addEventListener('click', () => this.useCustomDestination());
        this.elements.clearChatBtn.addEventListener('click', () => this.clearChat());
        this.elements.clearLogBtn.addEventListener('click', () => this.clearLog());

        // Enter key to send message
        this.elements.messageInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                this.sendMessage();
            }
        });
    }

    log(message, type = 'info') {
        const timestamp = new Date().toLocaleTimeString();
        const entry = document.createElement('div');
        entry.className = `log-entry ${type}`;
        entry.textContent = `[${timestamp}] ${message}`;
        this.elements.debugLog.appendChild(entry);
        this.elements.debugLog.scrollTop = this.elements.debugLog.scrollHeight;
        console.log(`[${type.toUpperCase()}] ${message}`);
    }

    clearLog() {
        this.elements.debugLog.innerHTML = '';
        this.log('Log cleared', 'info');
    }

    updateConnectionStatus(connected) {
        this.connected = connected;

        if (connected) {
            this.elements.statusDot.classList.add('connected');
            this.elements.statusText.textContent = 'Connected';
            this.elements.connectBtn.disabled = true;
            this.elements.disconnectBtn.disabled = false;
            this.elements.announceBtn.disabled = false;
            this.elements.customDest.disabled = false;
            this.elements.useCustomDestBtn.disabled = false;
            this.elements.messageInput.disabled = false;
            this.elements.sendBtn.disabled = false;
        } else {
            this.elements.statusDot.classList.remove('connected');
            this.elements.statusText.textContent = 'Disconnected';
            this.elements.connectBtn.disabled = false;
            this.elements.disconnectBtn.disabled = true;
            this.elements.announceBtn.disabled = true;
            this.elements.customDest.disabled = true;
            this.elements.useCustomDestBtn.disabled = true;
            this.elements.messageInput.disabled = true;
            this.elements.sendBtn.disabled = true;
        }
    }

    connect() {
        const wsUrl = this.elements.wsUrlInput.value;
        this.log(`Connecting to ${wsUrl}...`, 'info');

        try {
            this.ws = new WebSocket(wsUrl);

            this.ws.onopen = () => {
                this.log('✅ WebSocket connected!', 'success');
                this.updateConnectionStatus(true);
                this.reconnectAttempts = 0;
            };

            this.ws.onmessage = (event) => {
                try {
                    const message = JSON.parse(event.data);
                    this.handleMessage(message);
                } catch (error) {
                    this.log(`Error parsing message: ${error.message}`, 'error');
                }
            };

            this.ws.onclose = () => {
                this.log('WebSocket closed', 'warn');
                this.updateConnectionStatus(false);
                this.attemptReconnect();
            };

            this.ws.onerror = (error) => {
                this.log(`WebSocket error: ${error.message || 'Connection failed'}`, 'error');
            };

        } catch (error) {
            this.log(`Failed to create WebSocket: ${error.message}`, 'error');
        }
    }

    disconnect() {
        if (this.ws) {
            this.reconnectAttempts = this.maxReconnectAttempts; // Prevent reconnect
            this.ws.close();
            this.ws = null;
            this.log('Disconnected', 'info');
        }
    }

    attemptReconnect() {
        if (this.reconnectAttempts >= this.maxReconnectAttempts) {
            this.log('Max reconnect attempts reached', 'error');
            return;
        }

        this.reconnectAttempts++;
        const delay = this.reconnectAttempts * 2000;

        this.log(`Reconnecting in ${delay/1000}s (attempt ${this.reconnectAttempts}/${this.maxReconnectAttempts})`, 'warn');

        setTimeout(() => this.connect(), delay);
    }

    handleMessage(message) {
        this.log(`Received: ${message.type}`, 'info');

        switch (message.type) {
            case 'status':
                this.handleStatus(message.data);
                break;
            case 'lxmf_message':
                this.handleLXMFMessage(message.data);
                break;
            case 'peers_list':
                this.handlePeersList(message.data.peers);
                break;
            case 'announce_sent':
                this.log('Announce sent successfully', 'success');
                break;
            default:
                this.log(`Unknown message type: ${message.type}`, 'warn');
        }
    }

    handleStatus(data) {
        this.status = data;

        // Update identity display
        this.elements.identityHash.textContent = data.identity.substring(0, 32) + '...';
        this.elements.destinationHash.textContent = data.destination.substring(0, 32) + '...';
        this.elements.displayName.textContent = data.display_name || 'Mesh Bridge';

        this.log('Status received', 'success');

        // Request peers and messages
        this.sendCommand('get_peers');
        this.sendCommand('get_messages');
    }

    handleLXMFMessage(data) {
        const message = {
            source: data.source,
            destination: data.destination,
            content: data.content,
            timestamp: data.timestamp,
            title: data.title
        };

        this.messages.push(message);
        this.displayMessage(message);
        this.log(`Message from ${data.source.substring(0, 16)}...`, 'success');
    }

    handlePeersList(peers) {
        this.peers.clear();
        peers.forEach(peer => {
            this.peers.set(peer.destination, peer);
        });

        this.updatePeersList();
        this.log(`Received ${peers.length} peer(s)`, 'info');
    }

    updatePeersList() {
        const peersList = this.elements.peersList;
        peersList.innerHTML = '';

        if (this.peers.size === 0) {
            peersList.innerHTML = '<div class="empty-state">No peers discovered yet</div>';
            return;
        }

        this.peers.forEach((peer, destination) => {
            const peerElement = document.createElement('div');
            peerElement.className = 'peer-item';
            if (this.currentDestination === destination) {
                peerElement.classList.add('selected');
            }

            peerElement.innerHTML = `
                <div class="peer-name">${peer.displayName || 'Unknown'}</div>
                <div class="peer-hash">${destination.substring(0, 32)}...</div>
            `;

            peerElement.addEventListener('click', () => {
                this.selectPeer(destination);
            });

            peersList.appendChild(peerElement);
        });
    }

    selectPeer(destination) {
        this.currentDestination = destination;
        this.updatePeersList();

        const peer = this.peers.get(destination);
        this.elements.chatTitle.textContent = peer?.displayName || destination.substring(0, 16) + '...';
        this.elements.messagesContainer.innerHTML = '';

        this.log(`Selected peer: ${destination.substring(0, 16)}...`, 'info');
    }

    useCustomDestination() {
        const dest = this.elements.customDest.value.trim();
        if (!dest) {
            this.log('Please enter a destination', 'warn');
            return;
        }

        this.currentDestination = dest;
        this.elements.chatTitle.textContent = `Custom: ${dest.substring(0, 16)}...`;
        this.elements.messagesContainer.innerHTML = '';
        this.log(`Using custom destination: ${dest.substring(0, 16)}...`, 'info');
    }

    displayMessage(message) {
        const isSent = message.source === this.status?.destination;

        const messageElement = document.createElement('div');
        messageElement.className = `message ${isSent ? 'sent' : 'received'}`;

        const timestamp = new Date(message.timestamp * 1000).toLocaleString();
        const source = isSent ? 'You' : (message.source.substring(0, 16) + '...');

        messageElement.innerHTML = `
            <div class="message-meta">${source} • ${timestamp}</div>
            <div class="message-content">${this.escapeHtml(message.content)}</div>
        `;

        this.elements.messagesContainer.appendChild(messageElement);
        this.elements.messagesContainer.scrollTop = this.elements.messagesContainer.scrollHeight;
    }

    sendMessage() {
        if (!this.connected) {
            this.log('Not connected', 'error');
            return;
        }

        if (!this.currentDestination) {
            this.log('No destination selected', 'warn');
            return;
        }

        const content = this.elements.messageInput.value.trim();
        if (!content) {
            this.log('Message is empty', 'warn');
            return;
        }

        this.sendCommand('send_message', {
            destination: this.currentDestination,
            content: content,
            title: null
        });

        // Optimistic update
        const message = {
            source: this.status.destination,
            destination: this.currentDestination,
            content: content,
            timestamp: Date.now() / 1000
        };

        this.displayMessage(message);
        this.elements.messageInput.value = '';
        this.log('Message sent', 'success');
    }

    sendAnnounce() {
        this.sendCommand('announce');
        this.log('Sending announce...', 'info');
    }

    sendCommand(type, data = {}) {
        if (!this.ws || !this.connected) {
            this.log('Cannot send - not connected', 'error');
            return;
        }

        const message = {
            type: type,
            data: data
        };

        this.ws.send(JSON.stringify(message));
    }

    clearChat() {
        this.elements.messagesContainer.innerHTML = '';
        this.log('Chat cleared', 'info');
    }

    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }
}

// Initialize the client when the page loads
let client;
window.addEventListener('DOMContentLoaded', () => {
    client = new ReticulumClient();
});
