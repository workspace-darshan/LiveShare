import { useState, useEffect } from 'react'
import { useRouter } from 'next/router'
import { v4 as uuidv4 } from 'uuid'

export default function Home() {
  const router = useRouter()
  const [joinRoomId, setJoinRoomId] = useState('')

  useEffect(() => {
    fetch('/api/socket')
  }, [])

  const handleStartSharing = () => {
    const roomId = uuidv4()
    router.push(`/stream?room=${roomId}`)
  }

  const handleJoinRoom = () => {
    if (joinRoomId.trim()) {
      router.push(`/watch/${joinRoomId}`)
    }
  }

  return (
    <div className="min-h-screen bg-gray-100 flex items-center justify-center p-4">
      <div className="bg-white rounded-lg shadow-lg p-8 max-w-md w-full">
        <h1 className="text-3xl font-bold text-center mb-8 text-gray-800">
          Screen Share
        </h1>

        <div className="space-y-6">
          <div>
            <button
              onClick={handleStartSharing}
              className="w-full bg-blue-600 hover:bg-blue-700 text-white font-semibold py-3 px-6 rounded-lg transition"
            >
              Start Sharing
            </button>
            <p className="text-sm text-gray-500 mt-2 text-center">
              Create a new room and share your screen
            </p>
          </div>

          <div className="border-t pt-6">
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Join a Room
            </label>
            <div className="flex gap-2">
              <input
                type="text"
                value={joinRoomId}
                onChange={(e) => setJoinRoomId(e.target.value)}
                placeholder="Enter room ID"
                className="flex-1 px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                onKeyPress={(e) => e.key === 'Enter' && handleJoinRoom()}
              />
              <button
                onClick={handleJoinRoom}
                disabled={!joinRoomId.trim()}
                className="bg-green-600 hover:bg-green-700 disabled:bg-gray-400 text-white font-semibold py-2 px-6 rounded-lg transition"
              >
                Join
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
