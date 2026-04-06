# Next.js Screen Share App

Real-time screen sharing using WebRTC + Socket.io with Next.js

## Features
- Built-in Socket.io server using Next.js API routes
- No separate backend needed
- WebRTC peer-to-peer video streaming
- Real-time signaling

## Structure
- `pages/` - Next.js pages (routes)
- `pages/api/socket.js` - Socket.io server endpoint
- `lib/socket.js` - Socket.io client singleton
- `styles/` - Global CSS with Tailwind

## Run

```bash
npm install
npm run dev
```

Open http://localhost:3000

## Usage
1. Click "Start Sharing" → generates room
2. Copy the viewer link
3. Open link in another tab/browser
4. Click "Start Screen Share" on host page
5. Viewer sees the stream

## How it works
- Socket.io server runs inside Next.js API route at `/api/socket`
- First request to `/api/socket` initializes the server
- All subsequent connections reuse the same server instance
- WebRTC handles peer-to-peer video after signaling
