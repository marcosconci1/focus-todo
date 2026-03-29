"use client"

interface ProjectSeparatorProps {
  onCreateProject?: () => void
  className?: string
}

export default function ProjectSeparator({ onCreateProject, className }: ProjectSeparatorProps) {
  return (
    <div
      className={`relative h-full w-full cursor-pointer transition-opacity duration-200 opacity-0 ${className ?? ""}`}
      onClick={onCreateProject}
    >
      <div className="absolute inset-0 flex items-center justify-center">
        <div className="w-[60%] border-t border-dashed border-neutral-600" />
      </div>

      <div className="absolute inset-0 flex items-center justify-center">
        <span className="bg-[rgba(14,14,14,1)] px-3 text-xs font-mono font-bold text-zinc-600 transition-colors duration-200 group-hover:text-zinc-300">
          + Add Project
        </span>
      </div>
    </div>
  )
}
