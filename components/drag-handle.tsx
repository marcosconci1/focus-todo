"use client"

interface DragHandleProps {
  listeners?: any
  attributes?: any
}

export default function DragHandle({ listeners, attributes }: DragHandleProps) {
  return (
    <button
      {...listeners}
      {...attributes}
      className="opacity-0 group-hover:opacity-100 transition-opacity duration-200 cursor-grab active:cursor-grabbing text-neutral-500 hover:text-neutral-300 p-1 -ml-1"
      aria-label="Drag to reorder"
    >
      <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
        <circle cx="4" cy="3" r="1.5" />
        <circle cx="4" cy="8" r="1.5" />
        <circle cx="4" cy="13" r="1.5" />
        <circle cx="12" cy="3" r="1.5" />
        <circle cx="12" cy="8" r="1.5" />
        <circle cx="12" cy="13" r="1.5" />
      </svg>
    </button>
  )
}
