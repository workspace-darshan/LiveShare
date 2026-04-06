import { io } from 'socket.io-client'

let socket

export const initSocket = () => {
  if (!socket) {
    socket = io({
      path: '/api/socket'
    })
  }
  return socket
}

export const getSocket = () => socket
