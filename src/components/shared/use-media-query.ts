'use client'

import { useEffect, useState } from 'react'

/**
 * Subscribes to a CSS media query. Used to render exactly one responsive
 * branch instead of mounting both and hiding one with CSS — which duplicated
 * Mapbox WebGL contexts and chart instances.
 */
export function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(false)

  useEffect(() => {
    const media = window.matchMedia(query)
    const update = () => setMatches(media.matches)
    update()
    media.addEventListener('change', update)
    return () => media.removeEventListener('change', update)
  }, [query])

  return matches
}
