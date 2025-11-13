import { useState, useEffect, useRef } from 'react';
import { getReticulumClient, LXMFMessage, ReticulumPeer, ReticulumStatus } from '../lib/reticulumClient';

/**
 * Reticulum Network - LXMF Messaging Interface
 *
 * Connects to standalone Reticulum service via WebSocket
 * Provides LXMF encrypted messaging interface
 * Compatible with Sideband, NomadNet, and MeshChat
 */
function ReticulumNetwork() {
  const [connected, setConnected] = useState(false);
  const [status, setStatus] = useState<ReticulumStatus | null>(null);
  const [messages, setMessages] = useState<LXMFMessage[]>([]);
  const [peers, setPeers] = useState<ReticulumPeer[]>([]);
  const [selectedPeer, setSelectedPeer] = useState<string | null>(null);
  const [messageText, setMessageText] = useState('');
  const [customDestination, setCustomDestination] = useState('');
  const [showCustomDest, setShowCustomDest] = useState(false);
  const [sending, setSending] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const client = getReticulumClient();

  useEffect(() => {
    // Connect to Reticulum service
    client.connect().catch((error) => {
      console.error('[Reticulum] Failed to connect:', error);
    });

    // Event listeners
    const onConnected = () => {
      setConnected(true);
      console.log('[Reticulum] UI connected to service');
    };

    const onDisconnected = () => {
      setConnected(false);
      console.log('[Reticulum] UI disconnected from service');
    };

    const onStatusUpdate = (newStatus: ReticulumStatus) => {
      setStatus(newStatus);
    };

    const onMessage = (message: LXMFMessage) => {
      setMessages(prev => [message, ...prev]);

      // Auto-scroll to bottom
      setTimeout(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
      }, 100);
    };

    const onPeersUpdate = (newPeers: ReticulumPeer[]) => {
      setPeers(newPeers);
    };

    client.on('connected', onConnected);
    client.on('disconnected', onDisconnected);
    client.on('status-update', onStatusUpdate);
    client.on('message', onMessage);
    client.on('peers-update', onPeersUpdate);

    return () => {
      client.off('connected', onConnected);
      client.off('disconnected', onDisconnected);
      client.off('status-update', onStatusUpdate);
      client.off('message', onMessage);
      client.off('peers-update', onPeersUpdate);
    };
  }, []);

  const handleSendMessage = async () => {
    if (!messageText.trim()) return;

    const destination = showCustomDest ? customDestination : selectedPeer;
    if (!destination) {
      alert('Please select a peer or enter a destination address');
      return;
    }

    setSending(true);
    try {
      await client.sendMessage(destination, messageText);

      // Add to local messages (optimistic update)
      const newMessage: LXMFMessage = {
        source: status?.destination || '',
        destination,
        content: messageText,
        timestamp: Date.now() / 1000
      };
      setMessages(prev => [newMessage, ...prev]);

      setMessageText('');
    } catch (error) {
      console.error('[Reticulum] Failed to send message:', error);
      alert('Failed to send message. Check console for details.');
    } finally {
      setSending(false);
    }
  };

  const handleAnnounce = async () => {
    try {
      await client.announce();
      console.log('[Reticulum] Announce sent');
    } catch (error) {
      console.error('[Reticulum] Failed to send announce:', error);
    }
  };

  // Filter messages for selected peer
  const filteredMessages = selectedPeer && !showCustomDest
    ? messages.filter(m =>
        m.source === selectedPeer || m.destination === selectedPeer
      )
    : messages;

  // Connection status banner
  if (!connected) {
    return (
      <div className="space-y-6">
        <div>
          <h2 className="text-3xl font-bold text-white mb-2">Reticulum Network</h2>
          <p className="text-slate-400">LXMF Encrypted Messaging</p>
        </div>

        <div className="card p-12 text-center">
          <div className="w-16 h-16 bg-purple-500/20 rounded-full flex items-center justify-center mx-auto mb-4 animate-pulse">
            <svg className="w-8 h-8 text-purple-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 01-9 9m9-9a9 9 0 00-9-9m9 9H3m9 9a9 9 0 01-9-9m9 9c1.657 0 3-4.03 3-9s-1.343-9-3-9m0 18c-1.657 0-3-4.03-3-9s1.343-9 3-9m-9 9a9 9 0 019-9" />
            </svg>
          </div>
          <h3 className="text-xl font-bold text-white mb-2">Connecting to Reticulum Service...</h3>
          <p className="text-slate-400 mb-4">
            Make sure the Reticulum service is running
          </p>
          <p className="text-xs text-slate-500">
            Start with: npm start
          </p>
        </div>

        <div className="card p-4 bg-blue-500/10 border border-blue-500/30">
          <div className="flex gap-3">
            <svg className="w-5 h-5 text-blue-400 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <div>
              <p className="text-white text-sm font-medium">About LXMF</p>
              <p className="text-xs text-blue-200 mt-1">
                LXMF (Lightweight eXtensible Message Format) is an encrypted messaging protocol running on Reticulum.
                Compatible with Sideband, NomadNet, and MeshChat applications.
              </p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-3xl font-bold text-white mb-1">Reticulum Network</h2>
          <p className="text-slate-400">LXMF Encrypted Messaging • {peers.length} peer(s)</p>
        </div>
        <button
          onClick={handleAnnounce}
          className="btn btn-secondary flex items-center gap-2"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5.882V19.24a1.76 1.76 0 01-3.417.592l-2.147-6.15M18 13a3 3 0 100-6M5.436 13.683A4.001 4.001 0 017 6h1.832c4.1 0 7.625-1.234 9.168-3v14c-1.543-1.766-5.067-3-9.168-3H7a3.988 3.988 0 01-1.564-.317z" />
          </svg>
          Announce
        </button>
      </div>

      {/* Status Bar */}
      {status && (
        <div className="card p-4 bg-green-500/10 border border-green-500/30">
          <div className="flex items-center gap-3">
            <div className="status-dot status-connected"></div>
            <div className="flex-1">
              <p className="text-white font-medium">Connected to Network</p>
              <p className="text-xs text-green-200 mt-1">
                Identity: <code className="font-mono">{status.identity.substring(0, 32)}...</code>
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Main Content - Side by Side Layout */}
      <div className="grid grid-cols-3 gap-4">
        {/* Peers List - Left Sidebar */}
        <div className="card p-4">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-bold text-white">Contacts</h3>
            <span className="text-xs px-2 py-1 bg-purple-500/20 text-purple-300 rounded">
              {peers.length}
            </span>
          </div>

          {/* Custom Destination Toggle */}
          <button
            onClick={() => setShowCustomDest(!showCustomDest)}
            className={`w-full mb-3 p-3 rounded-lg border transition-colors text-left ${
              showCustomDest
                ? 'bg-purple-500/20 border-purple-500/50'
                : 'bg-slate-800/50 border-slate-700/50 hover:border-purple-500/30'
            }`}
          >
            <div className="flex items-center gap-2">
              <svg className="w-4 h-4 text-purple-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
              <span className="text-sm font-medium text-white">Custom Destination</span>
            </div>
          </button>

          {/* Custom Destination Input */}
          {showCustomDest && (
            <div className="mb-3">
              <input
                type="text"
                placeholder="Enter destination hash..."
                value={customDestination}
                onChange={(e) => setCustomDestination(e.target.value)}
                className="input w-full text-xs font-mono"
              />
            </div>
          )}

          {/* Peers List */}
          <div className="space-y-2 max-h-96 overflow-y-auto">
            {peers.length === 0 ? (
              <div className="text-center py-8">
                <svg className="w-8 h-8 text-slate-600 mx-auto mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" />
                </svg>
                <p className="text-slate-500 text-xs">No peers discovered</p>
                <p className="text-slate-600 text-xs mt-1">Send an announce to be visible</p>
              </div>
            ) : (
              peers.map((peer) => (
                <button
                  key={peer.destination}
                  onClick={() => {
                    setSelectedPeer(peer.destination);
                    setShowCustomDest(false);
                  }}
                  className={`w-full p-3 rounded-lg transition-all text-left ${
                    selectedPeer === peer.destination && !showCustomDest
                      ? 'bg-purple-500/30 border-2 border-purple-500'
                      : 'bg-slate-800/50 border border-slate-700/50 hover:border-purple-500/30'
                  }`}
                >
                  <div className="flex items-start gap-2">
                    <div className="w-8 h-8 bg-gradient-to-br from-purple-500 to-purple-700 rounded-lg flex items-center justify-center flex-shrink-0">
                      <span className="text-xs font-bold text-white">
                        {peer.displayName?.substring(0, 2).toUpperCase() || peer.destination.substring(0, 2).toUpperCase()}
                      </span>
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-white text-sm font-medium truncate">
                        {peer.displayName || peer.destination.substring(0, 16)}
                      </p>
                      <code className="text-xs text-slate-400 font-mono block truncate">
                        {peer.destination.substring(0, 24)}...
                      </code>
                      {peer.lastSeen && (
                        <p className="text-xs text-slate-500 mt-1">
                          {formatTimestamp(peer.lastSeen)}
                        </p>
                      )}
                    </div>
                  </div>
                </button>
              ))
            )}
          </div>
        </div>

        {/* Chat Area - Main Content (2 columns) */}
        <div className="col-span-2 card p-4 flex flex-col" style={{ height: '600px' }}>
          {/* Chat Header */}
          <div className="pb-4 border-b border-slate-700/50 mb-4">
            {showCustomDest ? (
              <div>
                <h3 className="text-lg font-bold text-white">Custom Destination</h3>
                <p className="text-xs text-slate-400 font-mono">
                  {customDestination || 'Enter address below'}
                </p>
              </div>
            ) : selectedPeer ? (
              <div>
                <h3 className="text-lg font-bold text-white">
                  {peers.find(p => p.destination === selectedPeer)?.displayName || 'Unknown'}
                </h3>
                <code className="text-xs text-slate-400 font-mono">{selectedPeer}</code>
              </div>
            ) : (
              <div>
                <h3 className="text-lg font-bold text-white">All Messages</h3>
                <p className="text-xs text-slate-400">Select a peer to filter messages</p>
              </div>
            )}
          </div>

          {/* Messages List */}
          <div className="flex-1 overflow-y-auto mb-4 space-y-3">
            {filteredMessages.length === 0 ? (
              <div className="text-center py-12">
                <svg className="w-12 h-12 text-slate-600 mx-auto mb-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z" />
                </svg>
                <p className="text-slate-500">No messages yet</p>
                <p className="text-slate-600 text-sm mt-1">Start a conversation</p>
              </div>
            ) : (
              <>
                {filteredMessages.slice().reverse().map((msg, index) => {
                  const isOutgoing = msg.source === status?.destination;
                  return (
                    <MessageBubble
                      key={index}
                      message={msg}
                      isOutgoing={isOutgoing}
                      peers={peers}
                    />
                  );
                })}
                <div ref={messagesEndRef} />
              </>
            )}
          </div>

          {/* Message Input */}
          <div className="flex gap-2">
            <input
              type="text"
              placeholder="Type a message..."
              value={messageText}
              onChange={(e) => setMessageText(e.target.value)}
              onKeyPress={(e) => e.key === 'Enter' && handleSendMessage()}
              disabled={sending}
              className="input flex-1"
            />
            <button
              onClick={handleSendMessage}
              disabled={sending || !messageText.trim()}
              className="btn btn-primary px-6"
            >
              {sending ? (
                <svg className="w-5 h-5 animate-spin" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                </svg>
              ) : (
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
                </svg>
              )}
            </button>
          </div>
        </div>
      </div>

      {/* Info Banner */}
      <div className="card p-4 bg-blue-500/10 border border-blue-500/30">
        <div className="flex gap-3">
          <svg className="w-5 h-5 text-blue-400 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <div>
            <p className="text-white text-sm font-medium">Interoperability</p>
            <p className="text-xs text-blue-200 mt-1">
              Messages sent here are compatible with Sideband (mobile), NomadNet (terminal), and MeshChat (web).
              All LXMF clients can communicate with each other over the Reticulum network.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

interface MessageBubbleProps {
  message: LXMFMessage;
  isOutgoing: boolean;
  peers: ReticulumPeer[];
}

function MessageBubble({ message, isOutgoing, peers }: MessageBubbleProps) {
  const peer = peers.find(p => p.destination === (isOutgoing ? message.destination : message.source));
  const displayName = peer?.displayName || (isOutgoing ? message.destination : message.source).substring(0, 16);

  return (
    <div className={`flex ${isOutgoing ? 'justify-end' : 'justify-start'}`}>
      <div className={`max-w-[70%] ${isOutgoing ? 'order-2' : 'order-1'}`}>
        <div className={`rounded-lg p-3 ${
          isOutgoing
            ? 'bg-purple-600 text-white'
            : 'bg-slate-800 text-slate-200'
        }`}>
          {!isOutgoing && (
            <p className="text-xs font-semibold mb-1 opacity-70">
              {displayName}
            </p>
          )}
          {message.title && (
            <p className="text-sm font-semibold mb-1">{message.title}</p>
          )}
          <p className="text-sm whitespace-pre-wrap break-words">{message.content}</p>
          <p className={`text-xs mt-2 ${isOutgoing ? 'text-purple-200' : 'text-slate-500'}`}>
            {formatTimestamp(message.timestamp * 1000)}
          </p>
        </div>
      </div>
    </div>
  );
}

function formatTimestamp(timestamp: number): string {
  const date = new Date(timestamp);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);

  if (diffMins < 1) return 'Just now';
  if (diffMins < 60) return `${diffMins}m ago`;

  const diffHours = Math.floor(diffMins / 60);
  if (diffHours < 24) return `${diffHours}h ago`;

  const diffDays = Math.floor(diffHours / 24);
  if (diffDays < 7) return `${diffDays}d ago`;

  return date.toLocaleDateString();
}

export default ReticulumNetwork;
