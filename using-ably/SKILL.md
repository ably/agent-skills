---
name: using-ably
description: Guidance for integrating Ably realtime messaging into applications. Covers product selection, SDK architecture, authentication, channel design, and common mistakes that cause production issues.
license: Apache-2.0
metadata:
  version: "1.1.0"
  tags: ably, realtime, pubsub, websocket, messaging, chat, spaces, ai-transport, liveobjects, livesync
---

# Using Ably

Use this skill when building or modifying an application that uses Ably for realtime messaging, chat, collaboration, or AI streaming.

## What Ably Is

Ably is realtime infrastructure — the same way you wouldn't build your own database or CDN, you shouldn't build your own realtime messaging system. Ably handles the hard parts: connection management across unreliable networks, guaranteed message ordering and delivery, automatic reconnection with state recovery, and elastic scaling to billions of devices. It works across platforms (25+ SDKs) and protocols (WebSocket, MQTT, SSE, HTTP), so you can focus on your application logic rather than transport reliability. Ably's platform delivers trillions of transactions to billions of devices each month with a 99.999% uptime SLA and has maintained 100% uptime for over 6 years.

## Documentation

Always check the official docs at [ably.com/docs](https://ably.com/docs) for current API references. For LLM-optimized documentation, use [ably.com/llms.txt](https://ably.com/llms.txt). The guidance below covers architectural decisions and common mistakes that documentation alone doesn't prevent.

---

## 1. Understand the Product and SDK Landscape

Ably is a multi-product platform, not a single SDK. Choosing the wrong product or SDK is the most common integration mistake.

### Product Layer: What Are You Building?

| Product | Use Case | SDK |
|---------|----------|-----|
| **Pub/Sub** | Core messaging: live dashboards, notifications, IoT, event streaming | `ably` (Realtime or REST) |
| **AI Transport** | Streaming LLM tokens, multi-agent coordination, resumable AI sessions | `ably` (Realtime) |
| **LiveObjects** | Shared mutable state: counters, key-value maps, collaborative data | `ably` + LiveObjects plugin |
| **LiveSync** | Database-to-frontend sync (PostgreSQL change streams) | `@ably-labs/models` + ADBC connector |
| **Chat** | Chat rooms, typing indicators, reactions, message history, moderation | `@ably/chat` |
| **Spaces** | Collaborative cursors, avatar stacks, member locations, component locking | `@ably/spaces` |

### SDK Architecture: Two Layers

**Layer 1 — Core SDKs** (used directly for Pub/Sub, AI Transport, LiveObjects, LiveSync):

| SDK | Use When | Connection |
|-----|----------|------------|
| **`Ably.Realtime`** | Client needs to **subscribe** to messages, presence, or state changes | Persistent WebSocket |
| **`Ably.Rest`** | Server-side **publish only**, token generation, history queries | Stateless HTTP |

These are the foundation. AI Transport, LiveObjects, and LiveSync all use the core Realtime SDK directly — they are patterns and plugins on top of Pub/Sub, not separate SDKs.

**Layer 2 — Product SDKs** (higher-level abstractions for specific use cases):

| SDK | Purpose |
|-----|---------|
| **`@ably/chat`** | Rooms, typing indicators, reactions, message history, moderation |
| **`@ably/spaces`** | Cursors, avatar stacks, member locations, component locking |

These are product SDKs that depend on the core Realtime SDK for connections, channel management, and other shared platform capabilities. You pass an `Ably.Realtime` instance when creating them. The underlying Realtime knowledge (auth, channels, presence) still applies.

### Decision Rules

```
Q: Is this server-side or client-side?
├── Server-side:
│   ├── Publishing, token generation, history → Use Ably.Rest (stateless HTTP)
│   └── Need persistent connection (AI token streaming, subscribing) → Use Ably.Realtime
└── Client-side → Use Ably.Realtime, then:
    ├── Building chat? → Use @ably/chat (pass Realtime instance)
    ├── Building collaboration? → Use @ably/spaces (pass Realtime instance)
    ├── Need shared state? → Use LiveObjects plugin with Realtime
    ├── Syncing database? → Use @ably-labs/models with ADBC connector
    └── Otherwise → Use Ably.Realtime directly (Pub/Sub, AI Transport)
```

**Server-side rule of thumb:** Default to `Ably.Rest` for server operations. Only use `Ably.Realtime` on the server when you genuinely need a persistent connection — for example, an AI agent streaming tokens to clients, or a backend service that subscribes to events.

### Common Mistakes

```javascript
// WRONG: Using REST SDK then polling for messages
const rest = new Ably.Rest({ key: '...' });
setInterval(async () => {
  const history = await rest.channels.get('updates').history();
}, 1000);

// RIGHT: Using Realtime SDK to subscribe
const realtime = new Ably.Realtime({ key: '...' });
realtime.channels.get('updates').subscribe((msg) => {
  console.log('Received:', msg.data);
});

// WRONG: Using raw Pub/Sub for chat when Chat SDK exists
const channel = realtime.channels.get('chat-room');
channel.subscribe((msg) => { /* manually handling typing, reactions, history... */ });

// RIGHT: Using Chat SDK which handles all chat patterns
import { ChatClient } from '@ably/chat';
const chat = new ChatClient(realtime);
const room = await chat.rooms.get('my-room');
room.messages.subscribe((msg) => console.log(msg.text));
await room.typing.keystroke(); // built-in typing indicators
```

---

## 2. Use Modern SDK Patterns (v2.x)

Ably's JavaScript SDK v2.x uses async/await. **Never generate callback-style 1.x patterns.**

```javascript
// WRONG: Old 1.x callback pattern (deprecated)
const channel = realtime.channels.get('updates');
channel.subscribe('event', function(message) {
  console.log(message.data);
});
channel.publish('event', { text: 'hello' }, function(err) {
  if (err) console.error(err);
});

// RIGHT: Modern 2.x async/await pattern
const channel = realtime.channels.get('updates');
channel.subscribe('event', (message) => {
  console.log(message.data);
});
await channel.publish('event', { text: 'hello' });
```

**Imports and initialization — keep it simple:**

```javascript
// RIGHT: Standard ESM import
import Ably from 'ably';
const realtime = new Ably.Realtime({ key: 'your-key' });
const rest = new Ably.Rest({ key: 'your-key' });

// RIGHT: Chat SDK import
import { ChatClient } from '@ably/chat';

// WRONG: Don't invent type-based initialization
const options: Ably.Types.ClientOptions = { ... }; // unnecessary
```

If you hit ESM/CommonJS import errors, check that your `tsconfig.json` has `"moduleResolution": "bundler"` or `"node16"`, and that you're importing from `'ably'` (not subpaths). Don't try multiple import strategies — check the [SDK README](https://github.com/ably/ably-js) for your environment.

**Server-side: Default to REST SDK.** For publishing, token generation, and history queries, use `Ably.Rest`. Only use `Ably.Realtime` on the server when you need a persistent connection (e.g., AI agent streaming tokens, or subscribing to events).

```javascript
// WRONG: Realtime SDK on server just to publish
const realtime = new Ably.Realtime({ key: '...' }); // opens WebSocket unnecessarily
await realtime.channels.get('events').publish('update', data);

// RIGHT: REST SDK for server-side publish
const rest = new Ably.Rest({ key: '...' }); // stateless HTTP
await rest.channels.get('events').publish('update', data);

// RIGHT: Realtime SDK on server when you need persistent connection
// e.g., AI agent streaming tokens to a channel
const realtime = new Ably.Realtime({ key: '...' });
const channel = realtime.channels.get('conversation:123');
for await (const token of llmStream) {
  channel.publish('token', token); // continuous streaming needs Realtime
}
```

---

## 3. Authentication

**API keys are for server-side only. Never expose them to clients.**

API keys don't expire. If leaked, attackers have indefinite access until you regenerate the key.

### Recommended: JWT Authentication

JWT is the recommended authentication method for client-side applications.

**Why JWT over Ably tokens:**
- No round-trip to Ably servers — your backend creates and signs the JWT directly
- Integrates with existing auth systems — uses standard JWT libraries you already have
- Capabilities defined per-token — not limited to what's configured on the API key
- Works everywhere — including environments without an Ably SDK (MQTT, embedded devices)

**How it works:**
1. Client requests a JWT from your backend (same as any JWT auth flow)
2. Your backend creates a JWT signed with your Ably API key secret
3. Client passes the JWT to Ably — no additional Ably server round-trip needed

**JWT Claims:**
- `kid` (header): Your Ably API key name (e.g., `xVLyHw.abcdef`)
- `iat`: Issued-at timestamp (seconds)
- `exp`: Expiration timestamp (seconds)
- `x-ably-capability`: JSON string of channel permissions
- `x-ably-clientId` (optional): Client identity for presence

```javascript
// Server-side: Create JWT for client
import jwt from 'jsonwebtoken';

app.post('/api/ably-auth', (req, res) => {
  const apiKey = process.env.ABLY_API_KEY; // 'appId.keyId:keySecret'
  const [keyName, keySecret] = apiKey.split(':');

  const token = jwt.sign(
    {
      'x-ably-capability': JSON.stringify({
        'chat:*': ['subscribe', 'publish', 'presence'],
        [`notifications:${req.user.id}`]: ['subscribe'],
      }),
      'x-ably-clientId': req.user.id,
    },
    keySecret,
    {
      expiresIn: '1h',
      keyid: keyName,
    }
  );

  res.json(token);
});

// Client-side: Use JWT with Ably
const realtime = new Ably.Realtime({
  authUrl: '/api/ably-auth',
  authMethod: 'POST',
});
```

### Alternative: Ably Token Requests

If you prefer Ably's native token system (requires a round-trip to Ably's servers from your backend):

```javascript
// Server-side
app.post('/api/ably-token', (req, res) => {
  const client = new Ably.Rest({ key: process.env.ABLY_API_KEY });
  client.auth.createTokenRequest({
    clientId: req.user.id,
    capability: { 'chat:*': ['subscribe', 'publish'] },
  }).then(tokenRequest => res.json(tokenRequest));
});
```

### Rules
- Server-side: API key is fine (`{ key: 'appId.keyId:keySecret' }`)
- Client-side: Always use `authUrl` or `authCallback` — never embed the API key
- Set `clientId` if you need presence features — it's required for presence
- Use capabilities to restrict what channels and operations each client can access

---

## 4. Channel Design

Channels separate messages into topics. Get the naming right early — it's hard to change later.

**Rules:**
- Use `:` as a hierarchy separator: `chat:room-123`, `orders:user-456`
- Channel names are case-sensitive
- Don't create one channel per message — channels are long-lived topics
- Use [channel namespaces](https://ably.com/docs/channels#namespaces) in the dashboard to apply rules (e.g., persistence, push notifications) to groups of channels

**Common patterns:**
```
chat:room-{roomId}           # Chat rooms
notifications:user-{userId}  # Per-user notifications
cursors:doc-{docId}          # Collaborative editing
events:{eventType}           # Event streaming
conversation:{sessionId}     # AI Transport sessions
```

---

## 5. Connection Management

The Realtime SDK manages reconnection automatically. Don't fight it.

**Rules:**
- Don't manually reconnect — the SDK handles transient failures with exponential backoff
- Listen to connection state changes to update UI:

```javascript
realtime.connection.on('connected', () => { /* online */ });
realtime.connection.on('disconnected', () => { /* temporarily offline */ });
realtime.connection.on('suspended', () => { /* offline for extended period */ });
```

- Call `realtime.close()` when done (component unmount, page unload, etc.)
- Messages published while disconnected are received on reconnection (within the 2-minute recovery window)
- For AI Transport: use channel `rewind` to hydrate returning clients with recent messages:

```javascript
const channel = realtime.channels.get('conversation:123', {
  params: { rewind: '2m' }  // Replay last 2 minutes on attach
});
```

---

## 6. Presence

Presence tracks which clients are on a channel. Use it for "who's online" features.

**Rules:**
- Set `clientId` during auth — it's required for presence
- Call `channel.presence.enter()` to announce, `channel.presence.leave()` to depart
- Use `channel.presence.get()` for current members, `channel.presence.subscribe()` for changes
- If a client disconnects ungracefully, Ably removes them after ~15 seconds (not instantly)
- Don't use presence for high-frequency data (cursor positions, typing coordinates) — use channels instead. Presence is for low-frequency state (online/offline, user status)
- For Chat: use `room.presence` instead of raw channel presence
- For Spaces: use `space.enter()` / `useMembers()` hook. Spaces has dedicated `cursors` API for cursor positions

---

## 7. Chat SDK: Critical Lifecycle

If using `@ably/chat`, these are the most common mistakes:

**Always `attach()` before subscribing.** Subscribing without attaching causes silent message loss — the worst kind of bug.

```javascript
const room = await chat.rooms.get('my-room');

// WRONG: Subscribe without attach — messages silently lost
room.messages.subscribe((msg) => console.log(msg.text));

// RIGHT: Attach first, then subscribe
await room.attach();
room.messages.subscribe((msg) => console.log(msg.text));
```

**Use the actual API.** The Chat SDK does NOT have: threading, read receipts, file attachments, or `room.messages.broadcast()`. Use `room.messages.send()` to send messages.

**Don't mix Chat and Pub/Sub patterns.** If you're using `@ably/chat`, use `room.messages`, `room.typing`, `room.reactions` — not raw `channel.subscribe()` / `channel.publish()`.

---

## 8. React Integration

Ably provides React hooks for each product:

| Product | Package | Key Hooks |
|---------|---------|-----------|
| Pub/Sub | `ably/react` | `useChannel`, `usePresence`, `useConnectionStateListener` |
| Chat | `@ably/chat/react` | `useMessages`, `useTyping`, `usePresence`, `useRoomReactions` |
| Spaces | `@ably/spaces/react` | `useMembers`, `useCursors`, `useLocations`, `useLocks` |

**Critical rule: Never create an Ably client inside a component.** This creates a new WebSocket connection on every render.

```javascript
// WRONG: Creates new connection every render — memory leak
function Chat() {
  const ably = new Ably.Realtime({ authUrl: '/api/ably-auth' });
  // ...
}

// RIGHT: Create client once, pass via provider
const ably = new Ably.Realtime({ authUrl: '/api/ably-auth' });

function App() {
  return (
    <AblyProvider client={ably}>
      <ChannelProvider channelName="chat:room-1">
        <Chat />
      </ChannelProvider>
    </AblyProvider>
  );
}
```

---

## 9. Production Checklist

Before going to production, verify:

- [ ] **No API keys in client code** — use JWT or token auth via `authUrl`/`authCallback`
- [ ] **Capabilities are scoped** — don't grant `{"*":["*"]}` to clients; restrict to specific channels and operations
- [ ] **Connection cleanup** — call `realtime.close()` on unmount/unload to avoid connection leaks
- [ ] **Error handling** — listen to `connection.on('failed')` and handle auth failures gracefully
- [ ] **Channel detach** — detach from channels you no longer need (`channel.detach()`)
- [ ] **Message size** — messages are limited to 64KB by default; if you're hitting this limit, split your payloads or reconsider your message design
- [ ] **Idempotent publishing** — set unique message IDs when exactly-once delivery matters
- [ ] **`echoMessages: false`** — set this on the Realtime client if publishers don't need to receive their own messages (saves bandwidth and cost)
- [ ] **Rate limits** — Ably enforces rate limits to prevent runaway mistakes and abuse (e.g., 50 messages/second per channel, 200 channels per connection). If you're hitting rate limits, you're likely doing something wrong — check your publish frequency, presence usage, and channel fan-out. Read the [limits documentation](https://ably.com/docs/general/limits)

### Error Handling

Some Ably error codes are broad (e.g., 40000, 50000). Always read the error **message text**, not just the code — the message contains the specific cause. Every error code has a dedicated help page:

```
https://help.ably.io/error/{code}
```

For example, [help.ably.io/error/40400](https://help.ably.io/error/40400) explains "not found" errors with common causes and resolutions.

---

## 10. Quick Reference

| What you want | Product | SDK | Docs |
|---------------|---------|-----|------|
| Publish/subscribe messages | Pub/Sub | `ably` | [ably.com/docs/pubsub](https://ably.com/docs/pubsub) |
| Stream AI model output | AI Transport | `ably` | [ably.com/docs/ai-transport](https://ably.com/docs/ai-transport) |
| Shared mutable state | LiveObjects | `ably` + plugin | [ably.com/docs/liveobjects](https://ably.com/docs/liveobjects) |
| Database-to-frontend sync | LiveSync | `@ably-labs/models` | [ably.com/docs/livesync](https://ably.com/docs/livesync) |
| Chat rooms, typing, reactions | Chat | `@ably/chat` | [ably.com/docs/chat](https://ably.com/docs/chat) |
| Cursors, avatars, locking | Spaces | `@ably/spaces` | [ably.com/docs/spaces](https://ably.com/docs/spaces) |

**Platform SDKs:** JavaScript, React, Python, Ruby, Java, Kotlin, Swift, .NET, Go, PHP, Flutter — [ably.com/docs/sdks](https://ably.com/docs/sdks)

**Ably CLI:** If you have shell access, the [Ably CLI](https://github.com/ably/cli) is useful for debugging and testing. Install with `npm install -g @ably/cli`, then use it to publish test messages, subscribe to channels, and verify your setup works before writing application code. Run `ably --help` to discover commands.

For API references, start at [ably.com/docs](https://ably.com/docs).
