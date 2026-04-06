import { Server } from 'socket.io'

const rooms = new Map()

export default function handler(req, res) {
  if (res.socket.server.io) {
    console.log('Socket.io already running')
    res.end()
    return
  }

  console.log('Starting Socket.io server...')
  const io = new Server(res.socket.server, {
    path: '/api/socket',
    addTrailingSlash: false,
    cors: {
      origin: '*',
      methods: ['GET', 'POST']
    }
  })

  res.socket.server.io = io

  io.on('connection', (socket) => {
    console.log('Client connected:', socket.id)

    socket.on('host-room', ({ roomId }) => {
      console.log('Host creating room:', roomId)
      rooms.set(roomId, {
        hostSocketId: socket.id,
        viewers: new Set()
      })
      socket.join(roomId)
    })

    socket.on('join-room', ({ roomId }) => {
      console.log('Viewer joining room:', roomId)
      const room = rooms.get(roomId)
      
      if (!room) {
        socket.emit('room-not-found')
        return
      }

      room.viewers.add(socket.id)
      socket.join(roomId)
      
      io.to(room.hostSocketId).emit('viewer-joined', { viewerId: socket.id })
    })

    socket.on('offer', ({ roomId, offer, to }) => {
      console.log('Forwarding offer to:', to)
      io.to(to).emit('offer', { offer, from: socket.id })
    })

    socket.on('answer', ({ roomId, answer, to }) => {
      console.log('Forwarding answer to:', to)
      io.to(to).emit('answer', { answer, from: socket.id })
    })

    socket.on('ice-candidate', ({ roomId, candidate, to }) => {
      io.to(to).emit('ice-candidate', { candidate, from: socket.id })
    })

    socket.on('disconnect', () => {
      console.log('Client disconnected:', socket.id)
      
      for (const [roomId, room] of rooms.entries()) {
        if (room.hostSocketId === socket.id) {
          room.viewers.forEach(viewerId => {
            io.to(viewerId).emit('host-left')
          })
          rooms.delete(roomId)
          console.log('Room deleted:', roomId)
        } else if (room.viewers.has(socket.id)) {
          room.viewers.delete(socket.id)
          io.to(room.hostSocketId).emit('viewer-left', { viewerId: socket.id })
        }
      }
    })
  })

  console.log('Socket.io server started')
  res.end()
}
