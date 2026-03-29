"use client"

import { useEffect, useState } from "react"
import type { ReactNode } from "react"
import { createPortal } from "react-dom"

interface ModalPortalProps {
  children: ReactNode
}

export default function ModalPortal({ children }: ModalPortalProps) {
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setMounted(true)
  }, [])

  if (!mounted) {
    return null
  }

  return createPortal(children, document.body)
}
