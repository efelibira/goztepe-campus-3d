import { useEffect, useState } from 'react'
import type { KeyboardEvent } from 'react'

export default function SceneObjectNameField({ name, onCommit }: { name: string; onCommit: (name: string) => void }) {
  const [draft, setDraft] = useState(name)
  useEffect(() => setDraft(name), [name])
  const commit = () => {
    const trimmed = draft.trim()
    if (!trimmed) {
      setDraft(name)
      return
    }
    if (trimmed !== name) onCommit(trimmed)
  }
  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Enter') {
      event.preventDefault()
      event.currentTarget.blur()
    } else if (event.key === 'Escape') {
      event.stopPropagation()
      setDraft(name)
      event.currentTarget.blur()
    }
  }
  return <label className="scene-object-name-field">
    <span>Nesne adı</span>
    <input type="text" maxLength={100} value={draft} onChange={(event) => setDraft(event.target.value)} onBlur={commit} onKeyDown={onKeyDown} />
  </label>
}
