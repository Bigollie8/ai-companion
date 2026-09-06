import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState
} from 'react'

const STORAGE_KEY = 'dashboard.hiddenProjects'
export const HIDDEN_LABEL = 'Hidden Project'

interface PrivacyCtx {
  hidden: Set<string>
  isHidden: (projectPath: string) => boolean
  toggleHidden: (projectPath: string) => void
  showHidden: boolean
  setShowHidden: (v: boolean) => void
  maskName: (projectPath: string, realName: string) => string
  hiddenCount: number
}

const Ctx = createContext<PrivacyCtx | null>(null)

function loadInitial(): Set<string> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return new Set()
    const arr = JSON.parse(raw)
    return Array.isArray(arr) ? new Set(arr.filter((x) => typeof x === 'string')) : new Set()
  } catch {
    return new Set()
  }
}

export function PrivacyProvider({ children }: { children: React.ReactNode }) {
  const [hidden, setHidden] = useState<Set<string>>(loadInitial)
  const [showHidden, setShowHidden] = useState(false)

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(Array.from(hidden)))
    } catch {
      /* ignore quota/security errors */
    }
  }, [hidden])

  const isHidden = useCallback((p: string) => hidden.has(p), [hidden])

  const toggleHidden = useCallback((p: string) => {
    setHidden((prev) => {
      const next = new Set(prev)
      if (next.has(p)) next.delete(p)
      else next.add(p)
      return next
    })
  }, [])

  const maskName = useCallback(
    (p: string, real: string) => (hidden.has(p) ? HIDDEN_LABEL : real),
    [hidden]
  )

  const value = useMemo<PrivacyCtx>(
    () => ({
      hidden,
      isHidden,
      toggleHidden,
      showHidden,
      setShowHidden,
      maskName,
      hiddenCount: hidden.size
    }),
    [hidden, showHidden, isHidden, toggleHidden, maskName]
  )

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

export function usePrivacy(): PrivacyCtx {
  const c = useContext(Ctx)
  if (!c) throw new Error('usePrivacy must be used within PrivacyProvider')
  return c
}
