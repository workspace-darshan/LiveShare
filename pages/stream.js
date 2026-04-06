import { useState, useEffect, useRef } from 'react'
import { useRouter } from 'next/router'
import { initSocket } from '../lib/socket'

const iceConfig = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' }
  ]
}

export default function Stream() {
  const router = useRouter()
  const { room: roomId } = router.query
  
  const [isSharing, _setIsSharing] = useState(false)
  const [viewerCount, setViewerCount] = useState(0)
  const [status, setStatus] = useState('Idle')
  const [isMicMuted, setIsMicMuted] = useState(false)
  const [isCameraOff, setIsCameraOff] = useState(false)
  
  const socketRef = useRef(null)
  const streamRef = useRef(null)
  const screenStreamRef = useRef(null)
  const userStreamRef = useRef(null)
  const peersRef = useRef(new Map())
  const videoRef = useRef(null)
  const cameraVideoRef = useRef(null)
  const isSharingRef = useRef(false)
  const pendingViewersRef = useRef(new Set())

  const setIsSharing = (val) => {
    isSharingRef.current = val
    _setIsSharing(val)
  }

  useEffect(() => {
    if (!roomId) return

    const socket = initSocket()
    socketRef.current = socket

    socket.emit('host-room', { roomId })
    setStatus('Ready')

    socket.on('viewer-joined', ({ viewerId }) => {
      console.log('Viewer joined:', viewerId)
      setViewerCount(prev => prev + 1)
      
      if (streamRef.current && isSharingRef.current) {
        console.log('Stream active — connecting viewer immediately')
        startPeerForViewer(viewerId)
      } else {
        console.log('Stream not active yet — queuing viewer')
        pendingViewersRef.current.add(viewerId)
      }
    })

    socket.on('answer', ({ answer, from }) => {
      console.log('Received answer from:', from)
      const pc = peersRef.current.get(from)
      if (pc) {
        pc.setRemoteDescription(new RTCSessionDescription(answer))
      }
    })

    socket.on('ice-candidate', ({ candidate, from }) => {
      const pc = peersRef.current.get(from)
      if (pc && candidate) {
        pc.addIceCandidate(new RTCIceCandidate(candidate)).catch(console.error)
      }
    })

    socket.on('viewer-left', ({ viewerId }) => {
      console.log('Viewer left:', viewerId)
      setViewerCount(prev => Math.max(0, prev - 1))
      pendingViewersRef.current.delete(viewerId)
      const pc = peersRef.current.get(viewerId)
      if (pc) {
        pc.close()
        peersRef.current.delete(viewerId)
      }
    })

    return () => {
      socket.off('viewer-joined')
      socket.off('answer')
      socket.off('ice-candidate')
      socket.off('viewer-left')
      stopScreenShare()
    }
  }, [roomId])

  const startPeerForViewer = async (viewerId) => {
    console.log('Creating peer for viewer:', viewerId)

    const existingPc = peersRef.current.get(viewerId)
    if (existingPc) {
      existingPc.close()
      peersRef.current.delete(viewerId)
    }

    const pc = new RTCPeerConnection(iceConfig)
    peersRef.current.set(viewerId, pc)
    
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => {
        console.log(`Adding ${track.kind} track`)
        pc.addTrack(track, streamRef.current)
      })
    } else {
      console.warn('No stream when creating peer — aborting')
      return
    }

    pc.onicecandidate = (event) => {
      if (event.candidate) {
        socketRef.current.emit('ice-candidate', {
          roomId,
          candidate: event.candidate,
          to: viewerId
        })
      }
    }

    pc.oniceconnectionstatechange = () => {
      console.log(`[${viewerId}] ICE state:`, pc.iceConnectionState)
    }

    pc.onconnectionstatechange = () => {
      console.log(`[${viewerId}] Connection state:`, pc.connectionState)
    }

    const offer = await pc.createOffer()
    await pc.setLocalDescription(offer)
    
    console.log('Sending offer to viewer:', viewerId)
    socketRef.current.emit('offer', {
      roomId,
      offer: pc.localDescription,
      to: viewerId
    })
  }

  const startScreenShare = async () => {
    try {
      // Get screen share
      const screenStream = await navigator.mediaDevices.getDisplayMedia({
        video: true,
        audio: true  // system audio
      })
      
      screenStreamRef.current = screenStream

      // Get camera + mic
      let userStream = null
      try {
        userStream = await navigator.mediaDevices.getUserMedia({
          video: true,  // camera
          audio: true   // microphone
        })
        userStreamRef.current = userStream

        // Show camera preview
        if (cameraVideoRef.current) {
          cameraVideoRef.current.srcObject = userStream
        }
      } catch (err) {
        console.warn('Camera/mic not available, continuing screen-only:', err.message)
      }

      // Combine all tracks into one stream
      const combinedStream = new MediaStream([
        ...screenStream.getTracks(),
        ...(userStream ? userStream.getTracks() : [])
      ])
      
      streamRef.current = combinedStream
      
      if (videoRef.current) {
        videoRef.current.srcObject = combinedStream
      }
      
      setIsSharing(true)
      setStatus('Live')

      screenStream.getVideoTracks()[0].onended = () => {
        stopScreenShare()
      }

      console.log('Pending viewers to connect:', [...pendingViewersRef.current])
      pendingViewersRef.current.forEach(viewerId => {
        startPeerForViewer(viewerId)
      })
      pendingViewersRef.current.clear()

    } catch (err) {
      console.error('Error starting screen share:', err)
      if (err.name !== 'NotAllowedError') {
        alert('Failed to start screen sharing: ' + err.message)
      }
    }
  }

  const stopScreenShare = () => {
    // Stop screen tracks
    if (screenStreamRef.current) {
      screenStreamRef.current.getTracks().forEach(track => track.stop())
      screenStreamRef.current = null
    }
    
    // Stop camera/mic tracks
    if (userStreamRef.current) {
      userStreamRef.current.getTracks().forEach(track => track.stop())
      userStreamRef.current = null
    }
    
    streamRef.current = null
    
    peersRef.current.forEach(pc => pc.close())
    peersRef.current.clear()
    pendingViewersRef.current.clear()
    
    setIsSharing(false)
    setStatus('Idle')
    setIsMicMuted(false)
    setIsCameraOff(false)
    
    if (videoRef.current) {
      videoRef.current.srcObject = null
    }
    if (cameraVideoRef.current) {
      cameraVideoRef.current.srcObject = null
    }
  }

  const toggleMic = () => {
    const audioTrack = userStreamRef.current?.getAudioTracks()[0]
    if (audioTrack) {
      audioTrack.enabled = !audioTrack.enabled
      setIsMicMuted(!audioTrack.enabled)
    }
  }

  const toggleCamera = () => {
    const videoTrack = userStreamRef.current?.getVideoTracks()[0]
    if (videoTrack) {
      videoTrack.enabled = !videoTrack.enabled
      setIsCameraOff(!videoTrack.enabled)
    }
  }

  const copyToClipboard = (text) => {
    navigator.clipboard.writeText(text)
    alert('Copied!')
  }

  const viewerLink = typeof window !== 'undefined' ? `${window.location.origin}/watch/${roomId}` : ''

  return (
    <div className="min-h-screen bg-gray-900 text-white p-6">
      <div className="max-w-6xl mx-auto">
        <div className="bg-gray-800 rounded-lg p-6 mb-6">
          <div className="flex items-center justify-between mb-4">
            <h1 className="text-2xl font-bold">Host Stream</h1>
            <div className="flex items-center gap-4">
              <span className={`px-3 py-1 rounded-full text-sm ${
                status === 'Live' ? 'bg-red-600' : 'bg-gray-600'
              }`}>
                {status}
              </span>
              <span className="px-3 py-1 bg-blue-600 rounded-full text-sm">
                {viewerCount} viewer{viewerCount !== 1 ? 's' : ''}
              </span>
            </div>
          </div>

          <div className="space-y-3">
            <div>
              <label className="text-sm text-gray-400">Room ID</label>
              <div className="flex gap-2 mt-1">
                <input
                  type="text"
                  value={roomId || ''}
                  readOnly
                  className="flex-1 bg-gray-700 px-3 py-2 rounded text-sm"
                />
                <button
                  onClick={() => copyToClipboard(roomId)}
                  className="bg-gray-600 hover:bg-gray-500 px-4 py-2 rounded text-sm"
                >
                  Copy
                </button>
              </div>
            </div>

            <div>
              <label className="text-sm text-gray-400">Viewer Link</label>
              <div className="flex gap-2 mt-1">
                <input
                  type="text"
                  value={viewerLink}
                  readOnly
                  className="flex-1 bg-gray-700 px-3 py-2 rounded text-sm"
                />
                <button
                  onClick={() => copyToClipboard(viewerLink)}
                  className="bg-gray-600 hover:bg-gray-500 px-4 py-2 rounded text-sm"
                >
                  Copy
                </button>
              </div>
            </div>
          </div>

          <div className="mt-4 flex gap-3 flex-wrap">
            {!isSharing ? (
              <button
                onClick={startScreenShare}
                className="bg-green-600 hover:bg-green-700 px-6 py-2 rounded font-semibold"
              >
                Start Screen Share
              </button>
            ) : (
              <>
                <button
                  onClick={stopScreenShare}
                  className="bg-red-600 hover:bg-red-700 px-6 py-2 rounded font-semibold"
                >
                  Stop Sharing
                </button>
                <button
                  onClick={toggleMic}
                  className={`${isMicMuted ? 'bg-red-600' : 'bg-gray-600'} hover:opacity-80 px-4 py-2 rounded font-semibold`}
                >
                  {isMicMuted ? '🎤 Unmute' : '🎤 Mute'}
                </button>
                <button
                  onClick={toggleCamera}
                  className={`${isCameraOff ? 'bg-red-600' : 'bg-gray-600'} hover:opacity-80 px-4 py-2 rounded font-semibold`}
                >
                  {isCameraOff ? '📷 Camera On' : '📷 Camera Off'}
                </button>
              </>
            )}
          </div>
        </div>

        {isSharing && (
          <div className="bg-gray-800 rounded-lg p-4">
            <h2 className="text-lg font-semibold mb-3">Your Screen Preview</h2>
            <div className="relative">
              <video
                ref={videoRef}
                autoPlay
                muted
                playsInline
                className="w-full rounded bg-black"
              />
              <video
                ref={cameraVideoRef}
                autoPlay
                muted
                playsInline
                className="w-32 h-24 rounded absolute bottom-4 right-4 border-2 border-white shadow-lg bg-black"
                style={{ display: isCameraOff ? 'none' : 'block' }}
              />
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
