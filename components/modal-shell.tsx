"use client"

import { useEffect, useRef } from "react"
import type { ReactNode } from "react"
import ModalPortal from "@/components/modal-portal"
import { cn } from "@/lib/utils"

interface ModalShellProps {
  children: ReactNode
  onClose: () => void
  overlayClassName?: string
  panelClassName?: string
  ariaLabelledby?: string
  ariaDescribedby?: string
}

export default function ModalShell({
  children,
  onClose,
  overlayClassName,
  panelClassName,
  ariaLabelledby,
  ariaDescribedby,
}: ModalShellProps) {
  const panelRef = useRef<HTMLDivElement>(null)
  const previousFocusRef = useRef<HTMLElement | null>(null)
  const onCloseRef = useRef(onClose)

  useEffect(() => {
    onCloseRef.current = onClose
  })

  useEffect(() => {
    previousFocusRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null
  }, [])

  useEffect(() => {
    const panel = panelRef.current
    if (!panel) return

    const focusablesSelector =
      'a[href],button:not([disabled]),textarea:not([disabled]),input:not([disabled]),select:not([disabled]),[tabindex]:not([tabindex="-1"])'

    const getFocusableElements = () =>
      Array.from(panel.querySelectorAll<HTMLElement>(focusablesSelector))

    const focusFrame = requestAnimationFrame(() => {
      const focusables = getFocusableElements()
      if (focusables.length > 0) {
        focusables[0].focus()
      } else {
        panel.focus()
      }
    })

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onCloseRef.current()
        return
      }
      if (event.key !== "Tab") return

      const focusables = getFocusableElements()
      if (focusables.length <= 1) return

      const first = focusables[0]
      const last = focusables[focusables.length - 1]
      const active = document.activeElement instanceof HTMLElement ? document.activeElement : null
      const isInside = active ? panel.contains(active) : false

      if (!isInside) {
        event.preventDefault()
        ;(event.shiftKey ? last : first).focus()
        return
      }

      if (event.shiftKey && active === first) {
        event.preventDefault()
        last.focus()
      } else if (!event.shiftKey && active === last) {
        event.preventDefault()
        first.focus()
      }
    }

    document.addEventListener("keydown", handleKeyDown)
    return () => {
      cancelAnimationFrame(focusFrame)
      document.removeEventListener("keydown", handleKeyDown)
      if (previousFocusRef.current && document.contains(previousFocusRef.current)) {
        previousFocusRef.current.focus()
      }
    }
  }, [])

  return (
    <ModalPortal>
      <div
        className={cn(
          "fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-50",
          overlayClassName,
        )}
        data-modal-open="true"
        onClick={onClose}
      >
        <div
          ref={panelRef}
          role="dialog"
          aria-modal="true"
          aria-labelledby={ariaLabelledby}
          aria-describedby={ariaDescribedby}
          tabIndex={-1}
          className={cn("relative", panelClassName)}
          onClick={(event) => event.stopPropagation()}
        >
          {children}
        </div>
      </div>
    </ModalPortal>
  )
}
