import { useState } from 'react'
import { ChevronDown, ChevronRight, File, Folder, FolderOpen } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { FileNode } from '@/types/api'

interface FileTreeNodeProps {
  node: FileNode
  depth: number
  selectedPath: string | null
  onSelectFile: (path: string) => void
}

function FileTreeNode({ node, depth, selectedPath, onSelectFile }: FileTreeNodeProps) {
  const isDir = Boolean(node.children)
  const [open, setOpen] = useState(true)  // 기본 펼침 상태

  const indent = depth * 16

  if (isDir) {
    return (
      <div>
        <button
          onClick={() => setOpen(!open)}
          className="flex items-center gap-1 w-full text-left py-0.5 px-2 rounded hover:bg-surface-2 transition-colors cursor-pointer group"
          style={{ paddingLeft: `${8 + indent}px` }}
        >
          <span className="text-text-muted group-hover:text-foreground transition-colors">
            {open ? (
              <ChevronDown className="h-3.5 w-3.5" />
            ) : (
              <ChevronRight className="h-3.5 w-3.5" />
            )}
          </span>
          {open ? (
            <FolderOpen className="h-3.5 w-3.5 text-accent-green shrink-0" />
          ) : (
            <Folder className="h-3.5 w-3.5 text-accent-green shrink-0" />
          )}
          <span className="text-xs font-mono text-foreground truncate">{node.name}</span>
        </button>
        {open && node.children && (
          <div>
            {node.children.map((child) => (
              <FileTreeNode
                key={child.path}
                node={child}
                depth={depth + 1}
                selectedPath={selectedPath}
                onSelectFile={onSelectFile}
              />
            ))}
          </div>
        )}
      </div>
    )
  }

  return (
    <button
      onClick={() => onSelectFile(node.path)}
      className={cn(
        'flex items-center gap-1 w-full text-left py-0.5 px-2 rounded transition-colors cursor-pointer',
        selectedPath === node.path
          ? 'bg-accent-green/10 text-accent-green'
          : 'hover:bg-surface-2 text-text-muted hover:text-foreground',
      )}
      style={{ paddingLeft: `${8 + indent}px` }}
    >
      <File className="h-3.5 w-3.5 shrink-0" />
      <span className="text-xs font-mono truncate">{node.name}</span>
    </button>
  )
}

interface FileTreeProps {
  nodes: FileNode[]
  selectedPath: string | null
  onSelectFile: (path: string) => void
  className?: string
}

export function FileTree({ nodes, selectedPath, onSelectFile, className }: FileTreeProps) {
  return (
    <div className={cn('overflow-y-auto py-2', className)}>
      {nodes.map((node) => (
        <FileTreeNode
          key={node.path}
          node={node}
          depth={0}
          selectedPath={selectedPath}
          onSelectFile={onSelectFile}
        />
      ))}
    </div>
  )
}
