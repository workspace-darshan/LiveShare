import { useState, useEffect, useRef } from 'react'
import { useRouter } from 'next/router'
import { initSocket } from '../../lib/socket'

const iceConfig = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' }
  ]
}

export default function Watch() {
  const router = useRouter()
  const { roomId } = router.query
  
  const [status, setStatus] = useState('Connecting...')
  const [error, setError] = useState(null)
  
  const socketRef = useRef(null)
  const pcRef = useRef(null)
  const videoRef = useRef(null)
  const iceCandidatesQueue = useRef([])
  const pendingStreamRef = useRef(null)

  useEffect(() => {
    if (videoRef.current && pendingStreamRef.current) {
      videoRef.current.srcObject = pendingStreamRef.current
      setStatus('Watching')
    }
  }, [])

  useEffect(() => {
    if (!roomId) return

    const socket = initSocket()
    socketRef.current = socket

    socket.emit('join-room', { roomId })

    socket.on('room-not-found', () => {
      setStatus('Error')
      setError('Room not found. Check the room ID and try again.')
    })

    socket.on('host-left', () => {
      setStatus('Stream Ended')
      if (pcRef.current) {
        pcRef.current.close()
        pcRef.current = null
      }
    })

    socket.on('offer', async ({ offer, from }) => {
      console.log('Received offer from:', from)
      if (pcRef.current) {
        pcRef.current.close()
        pcRef.current = null
        iceCandidatesQueue.current = []
      }
      try {
        await createViewerPeer(offer, from)
      } catch (err) {
        console.error('Error creating viewer peer:', err)
        setError('Failed to connect: ' + err.message)
      }
    })

    socket.on('ice-candidate', ({ candidate, from }) => {
      if (!candidate) return
      if (pcRef.current && pcRef.current.remoteDescription) {
        pcRef.current.addIceCandidate(new RTCIceCandidate(candidate)).catch(console.error)
      } else {
        iceCandidatesQueue.current.push(candidate)
      }
    })

    return () => {
      socket.off('room-not-found')
      socket.off('host-left')
      socket.off('offer')
      socket.off('ice-candidate')
      
      if (pcRef.current) {
        pcRef.current.close()
        pcRef.current = null
      }
    }
  }, [roomId])

  const createViewerPeer = async (offer, from) => {
    console.log('Creating viewer peer...')
    const pc = new RTCPeerConnection(iceConfig)
    pcRef.current = pc

    pc.ontrack = (event) => {
      console.log('Received track:', event.track.kind, 'state:', event.track.readyState)
      const stream = event.streams[0]
      if (!stream) return

      pendingStreamRef.current = stream

      if (videoRef.current) {
        videoRef.current.srcObject = stream
        setStatus('Watching')
      }
    }

    pc.onicecandidate = (event) => {
      if (event.candidate) {
        socketRef.current.emit('ice-candidate', {
          roomId,
          candidate: event.candidate,
          to: from
        })
      }
    }

    pc.oniceconnectionstatechange = () => {
      console.log('ICE state:', pc.iceConnectionState)
      if (pc.iceConnectionState === 'failed') {
        console.warn('ICE failed — may need a TURN server for cross-network connections')
      }
    }

    pc.onconnectionstatechange = () => {
      console.log('Connection state:', pc.connectionState)
      if (pc.connectionState === 'connected') {
        setStatus('Watching')
      } else if (pc.connectionState === 'failed') {
        setStatus('Connection Lost')
        setError('Connection failed. If on different networks, a TURN server is needed.')
      } else if (pc.connectionState === 'disconnected') {
        setStatus('Reconnecting...')
      }
    }

    await pc.setRemoteDescription(new RTCSessionDescription(offer))
    console.log('Remote description set')
    
    while (iceCandidatesQueue.current.length > 0) {
      const candidate = iceCandidatesQueue.current.shift()
      await pc.addIceCandidate(new RTCIceCandidate(candidate)).catch(console.error)
    }

    const answer = await pc.createAnswer()
    await pc.setLocalDescription(answer)
    console.log('Answer created, sending to host')

    socketRef.current.emit('answer', {
      roomId,
      answer: pc.localDescription,
      to: from
    })
  }

  return (
    <div className="min-h-screen bg-gray-900 text-white">
      <div className="bg-gray-800 px-6 py-2 flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold">Viewing Room</h1>
          <p className="text-sm text-gray-400">{roomId}</p>
        </div>
        <span className={`px-3 py-1 rounded-full text-sm ${
          status === 'Watching' ? 'bg-green-600' :
          status === 'Error' || status === 'Stream Ended' || status === 'Connection Lost' ? 'bg-red-600' :
          status === 'Reconnecting...' ? 'bg-orange-500' :
          'bg-yellow-600'
        }`}>
          {status}
        </span>
      </div>

      <div className="p-2">
        {error ? (
          <div className="bg-red-900 border border-red-700 rounded-lg p-8 text-center">
            <h2 className="text-2xl font-bold mb-2">Error</h2>
            <p className="text-gray-300">{error}</p>
          </div>
        ) : status === 'Stream Ended' ? (
          <div className="bg-gray-800 rounded-lg p-8 text-center">
            <h2 className="text-2xl font-bold mb-2">Stream Ended</h2>
            <p className="text-gray-400">The host has stopped sharing</p>
          </div>
        ) : (
          <div className="bg-black rounded-lg overflow-hidden">
            <video
              ref={videoRef}
              autoPlay
              playsInline
              className="w-full"
              style={{ display: status === 'Watching' ? 'block' : 'none' }}
            />
            {status !== 'Watching' && (
              <div className="flex items-center justify-center h-64 text-gray-500">
                <div className="text-center">
                  <div className="text-4xl mb-3">⏳</div>
                  <p>{status}</p>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
