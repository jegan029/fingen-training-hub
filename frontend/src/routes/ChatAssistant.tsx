import { useState, useEffect, useRef } from 'react'
import { useSearchParams } from 'react-router-dom'
import { Bot, Send } from 'lucide-react'
import { fetchRoadmaps, chatQuery } from '../api'
import type { LearningPath } from '../types'
import Markdown from '../components/Markdown'
import page from '../styles/page.module.css'
import styles from './ChatAssistant.module.css'

interface Message {
  role: 'user' | 'bot'
  text: string
}

const MAX_MESSAGE = 2000

export default function ChatAssistant() {
  const [paths, setPaths] = useState<LearningPath[]>([])
  const [searchParams] = useSearchParams()
  // "Ask the AI Tutor about this" links here with ?path=<id>&q=<question> to prefill the chat.
  const [pathId, setPathId] = useState(() => searchParams.get('path') ?? '1')
  const [input, setInput] = useState(() => (searchParams.get('q') ?? '').slice(0, MAX_MESSAGE))
  const [messages, setMessages] = useState<Message[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const bottomRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    fetchRoadmaps()
      .then(setPaths)
      .catch(() => setError('Could not load training paths'))
  }, [])

  useEffect(() => {
    bottomRef.current?.scrollIntoView?.({ behavior: 'smooth', block: 'nearest' })
  }, [messages, loading])

  const send = async (e?: React.FormEvent) => {
    e?.preventDefault()
    const text = input.trim()
    if (!text || loading) return
    setInput('')
    setError(null)
    setMessages((prev) => [...prev, { role: 'user', text }])
    setLoading(true)
    try {
      const res = await chatQuery(Number(pathId), text)
      setMessages((prev) => [...prev, { role: 'bot', text: res.answer }])
    } catch (err) {
      setError((err as Error).message || 'Request failed')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className={`${page.page} ${page.narrow}`}>
      <header className={page.header}>
        <h1 className={page.title}>AI Tutor</h1>
        <p className={page.lead}>
          Ask about the selected training path. Answers come only from the lessons in that path.
        </p>
      </header>

      <div className={styles.context}>
        <label className={page.label} htmlFor="chat-path">
          Training path
        </label>
        <select
          id="chat-path"
          className={`${page.input} ${styles.select}`}
          value={pathId}
          onChange={(e) => setPathId(e.target.value)}
        >
          {paths.map((p) => (
            <option key={p.id} value={p.id}>
              {p.title}
            </option>
          ))}
          {paths.length === 0 && <option value={pathId}>Loading paths…</option>}
        </select>
      </div>

      {error && (
        <p className={page.error} role="alert">
          {error}
        </p>
      )}

      <div className={styles.window}>
        <div className={styles.log} role="log" aria-live="polite" aria-label="Conversation">
          {messages.length === 0 && (
            <div className={styles.empty}>
              <span className={styles.emptyIcon}>
                <Bot size={24} aria-hidden="true" />
              </span>
              <p className={styles.emptyTitle}>Ask the AI Tutor</p>
              <p className={styles.emptyText}>
                For example: "How does the Fingen settlement process work?" or "What are common L2 escalation triggers?"
              </p>
            </div>
          )}
          {messages.map((m, i) => (
            <div key={i} className={`${styles.msg} ${m.role === 'user' ? styles.user : styles.bot}`}>
              <p className={styles.msgLabel}>{m.role === 'user' ? 'You' : 'AI Tutor'}</p>
              {m.role === 'bot' ? (
                <Markdown className="md-chat">{m.text}</Markdown>
              ) : (
                <p className={styles.userText}>{m.text}</p>
              )}
            </div>
          ))}
          {loading && (
            <div className={`${styles.msg} ${styles.bot}`}>
              <p className={styles.msgLabel}>AI Tutor</p>
              <p className={styles.thinking}>Thinking…</p>
            </div>
          )}
          <div ref={bottomRef} />
        </div>

        <form className={styles.inputRow} onSubmit={send}>
          <input
            className={page.input}
            value={input}
            maxLength={MAX_MESSAGE}
            aria-label="Your question"
            placeholder="Ask a question about the training path"
            onChange={(e) => setInput(e.target.value)}
            disabled={loading}
          />
          <button type="submit" className={`${page.btn} ${page.btnPrimary}`} disabled={loading || !input.trim()}>
            <Send size={16} aria-hidden="true" /> {loading ? 'Sending' : 'Send'}
          </button>
        </form>
      </div>
    </div>
  )
}
