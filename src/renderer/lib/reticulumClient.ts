/**
 * Reticulum Service WebSocket Client
 *
 * Connects to the standalone Reticulum service (reticulum-service/) via WebSocket
 * Provides LXMF messaging capabilities for the web GUI
 */

import { EventEmitter } from 'events';

export interface LXMFMessage {
  source: string;
  destination: string;
  content: string;
  timestamp: number;
  title?: string;
  fields?: any;
}

export interface ReticulumPeer {
  destination: string;
  displayName?: string;
  lastSeen?: number;
  announces: number;
}

export interface ReticulumStatus {
  running: boolean;
  identity: string;
  destination: string;
  displayName: string;
}

export interface ReticulumServiceMessage {
  type: string;
  data: any;
}

export class ReticulumClient extends EventEmitter {
  private ws: WebSocket | null = null;
  private reconnectTimer: NodeJS.Timeout | null = null;
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 10;
  private reconnectDelay = 2000;
  private wsUrl: string;
  private connected = false;

  // State
  private status: ReticulumStatus | null = null;
  private messages: LXMFMessage[] = [];
  private peers: Map<string, ReticulumPeer> = new Map();

  constructor(wsUrl = 'ws://localhost:4243') {
    super();
    this.wsUrl = wsUrl;
  }

  /**
   * Connect to Reticulum service
   */
  connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      if (this.connected) {
        resolve();
        return;
      }

      try {
        this.ws = new WebSocket(this.wsUrl);

        this.ws.onopen = () => {
          console.log('[Reticulum] Connected to service');
          this.connected = true;
          this.reconnectAttempts = 0;
          this.emit('connected');
          resolve();
        };

        this.ws.onmessage = (event) => {
          try {
            const message: ReticulumServiceMessage = JSON.parse(event.data);
            this.handleMessage(message);
          } catch (error) {
            console.error('[Reticulum] Error parsing message:', error);
          }
        };

        this.ws.onclose = () => {
          console.log('[Reticulum] Disconnected from service');
          this.connected = false;
          this.emit('disconnected');
          this.attemptReconnect();
        };

        this.ws.onerror = (error) => {
          console.error('[Reticulum] WebSocket error:', error);
          this.emit('error', error);
          reject(error);
        };
      } catch (error) {
        console.error('[Reticulum] Failed to create WebSocket:', error);
        reject(error);
      }
    });
  }

  /**
   * Disconnect from Reticulum service
   */
  disconnect() {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }

    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }

    this.connected = false;
  }

  /**
   * Attempt to reconnect
   */
  private attemptReconnect() {
    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      console.error('[Reticulum] Max reconnect attempts reached');
      this.emit('max-reconnects-reached');
      return;
    }

    this.reconnectAttempts++;
    const delay = this.reconnectDelay * this.reconnectAttempts;

    console.log(`[Reticulum] Reconnecting in ${delay}ms (attempt ${this.reconnectAttempts}/${this.maxReconnectAttempts})`);

    this.reconnectTimer = setTimeout(() => {
      this.connect().catch((error) => {
        console.error('[Reticulum] Reconnect failed:', error);
      });
    }, delay);
  }

  /**
   * Handle incoming message from Reticulum service
   */
  private handleMessage(message: ReticulumServiceMessage) {
    const { type, data } = message;

    switch (type) {
      case 'status':
        this.handleStatus(data);
        break;

      case 'lxmf_message':
        this.handleLXMFMessage(data);
        break;

      case 'announce_sent':
        this.emit('announce-sent', data);
        break;

      case 'peers_list':
        this.handlePeersList(data.peers);
        break;

      case 'messages_list':
        this.handleMessagesList(data.messages);
        break;

      default:
        console.warn('[Reticulum] Unknown message type:', type);
    }
  }

  /**
   * Handle status update from service
   */
  private handleStatus(data: any) {
    this.status = {
      running: data.running,
      identity: data.identity,
      destination: data.destination,
      displayName: data.display_name
    };

    this.emit('status-update', this.status);

    // Request peers and messages after receiving status
    this.requestPeers();
    this.requestMessages();
  }

  /**
   * Handle incoming LXMF message
   */
  private handleLXMFMessage(data: any) {
    const message: LXMFMessage = {
      source: data.source,
      destination: data.destination,
      content: data.content,
      timestamp: data.timestamp,
      title: data.title,
      fields: data.fields
    };

    this.messages.unshift(message);
    this.emit('message', message);

    // Update peer last seen
    if (!this.peers.has(message.source)) {
      this.peers.set(message.source, {
        destination: message.source,
        displayName: message.source.substring(0, 16),
        lastSeen: Date.now(),
        announces: 1
      });
    } else {
      const peer = this.peers.get(message.source)!;
      peer.lastSeen = Date.now();
      this.peers.set(message.source, peer);
    }

    this.emit('peers-update', Array.from(this.peers.values()));
  }

  /**
   * Handle peers list from service
   */
  private handlePeersList(peers: any[]) {
    peers.forEach(peer => {
      this.peers.set(peer.destination, peer);
    });

    this.emit('peers-update', Array.from(this.peers.values()));
  }

  /**
   * Handle messages list from service
   */
  private handleMessagesList(messages: any[]) {
    messages.forEach(msg => {
      if (msg.type === 'lxmf_message') {
        this.handleLXMFMessage(msg.data);
      }
    });
  }

  /**
   * Send LXMF message to destination
   */
  sendMessage(destination: string, content: string, title?: string): Promise<void> {
    return new Promise((resolve, reject) => {
      if (!this.connected || !this.ws) {
        reject(new Error('Not connected to Reticulum service'));
        return;
      }

      try {
        const message = {
          type: 'send_message',
          data: {
            destination,
            content,
            title
          }
        };

        this.ws.send(JSON.stringify(message));
        resolve();
      } catch (error) {
        reject(error);
      }
    });
  }

  /**
   * Send announce to network
   */
  announce(): Promise<void> {
    return new Promise((resolve, reject) => {
      if (!this.connected || !this.ws) {
        reject(new Error('Not connected to Reticulum service'));
        return;
      }

      try {
        const message = {
          type: 'announce',
          data: {}
        };

        this.ws.send(JSON.stringify(message));
        resolve();
      } catch (error) {
        reject(error);
      }
    });
  }

  /**
   * Request list of peers
   */
  requestPeers() {
    if (!this.connected || !this.ws) return;

    try {
      this.ws.send(JSON.stringify({
        type: 'get_peers',
        data: {}
      }));
    } catch (error) {
      console.error('[Reticulum] Error requesting peers:', error);
    }
  }

  /**
   * Request message history
   */
  requestMessages() {
    if (!this.connected || !this.ws) return;

    try {
      this.ws.send(JSON.stringify({
        type: 'get_messages',
        data: {}
      }));
    } catch (error) {
      console.error('[Reticulum] Error requesting messages:', error);
    }
  }

  /**
   * Get current status
   */
  getStatus(): ReticulumStatus | null {
    return this.status;
  }

  /**
   * Get all messages
   */
  getMessages(): LXMFMessage[] {
    return this.messages;
  }

  /**
   * Get all peers
   */
  getPeers(): ReticulumPeer[] {
    return Array.from(this.peers.values());
  }

  /**
   * Check if connected
   */
  isConnected(): boolean {
    return this.connected;
  }
}

// Singleton instance
let reticulumClient: ReticulumClient | null = null;

export function getReticulumClient(wsUrl?: string): ReticulumClient {
  if (!reticulumClient) {
    reticulumClient = new ReticulumClient(wsUrl);
  }
  return reticulumClient;
}
