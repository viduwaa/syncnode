'use client'

import { useEffect } from 'react'
import { usePlayerStore } from '@/lib/store'

const BACKEND_URL = process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:8080'
const WS_URL = BACKEND_URL.replace('http', 'ws') + '/ws'

export default function PlayerSync() {
  const updateState = usePlayerStore((state) => state.updateState)

  useEffect(() => {
    // 1. Fetch initial state
    const fetchInitial = async () => {
      try {
        const resp = await fetch(`${BACKEND_URL}/api/player`)
        if (resp.ok) {
          const data = await resp.json()
          updateState(data)
        }
      } catch (err) {
        console.error('Failed to fetch initial player state:', err)
      }
    }

    fetchInitial()

    // 2. Setup WebSocket
    let ws: WebSocket | null = null
    let reconnectTimeout: NodeJS.Timeout

    const connect = () => {
      ws = new WebSocket(WS_URL)

      ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data)
          
          if (data.type === 'FULL_STATE') {
            updateState(data.payload)
          } else if (data.type === 'PROGRESS') {
            usePlayerStore.setState({
              progress: data.payload.progress,
              duration: data.payload.duration,
              isPlaying: data.payload.isPlaying,
            })
          } else if (data.type === 'DEVICES_UPDATE') {
            usePlayerStore.getState().setDevices(data.payload)
          } else if (!data.type) {
             // Fallback for full state direct broadcast without type wrapper
             updateState(data)
          }

        } catch (err) {
          console.error('Failed to parse WS message:', err)
        }
      }

      ws.onclose = () => {
        console.log('WS connection closed, reconnecting...')
        reconnectTimeout = setTimeout(connect, 3000)
      }

      ws.onerror = (err) => {
        console.error('WS error:', err)
        ws?.close()
      }
    }

    connect()

    return () => {
      ws?.close()
      clearTimeout(reconnectTimeout)
    }
  }, [updateState])

  return null // This component doesn't render anything
}
