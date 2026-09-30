import { useEffect, useState } from 'react'
import { useParams, Link, useNavigate } from 'react-router-dom'
import { fetchAssessmentQuestion, submitAssessment } from '../api'
import type { AssessmentResult } from '../types'
import Markdown from '../components/Markdown'
import Skeleton from '../components/ui/Skeleton'
import StateMessage from '../components/ui/StateMessage'
import page from '../styles/page.module.css'
import styles from './Assessment.module.css'

const MAX_ANSWER = 4000

function scoreTone(score: number) {
  if (score >= 8) return styles.good
  if (score >= 5) return styles.fair
  return styles.poor
}

export default function AssessmentPage() {
  const { nodeId } = useParams<{ nodeId: string }>()
  const navigate = useNavigate()
  const [question, setQuestion] = useState<string | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [answer, setAnswer] = useState('')
  const [result, setResult] = useState<AssessmentResult | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (!nodeId) return
    fetchAssessmentQuestion(Number(nodeId))
      .then((data) => setQuestion(data.question))
      .catch((err: Error) => setLoadError(err.message || 'Unable to load question'))
  }, [nodeId])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    setLoading(true)
    try {
      setResult(await submitAssessment(Number(nodeId), answer))
    } catch (err) {
      setError((err as Error).message || 'Evaluation failed')
    } finally {
      setLoading(false)
    }
  }

  if (loadError) {
    return (
      <div className={`${page.page} ${page.narrow}`}>
        <StateMessage
          tone="error"
          title="This assessment is not available"
          action={
            <Link to="/roadmaps" className={page.btn}>
              Back to training paths
            </Link>
          }
        >
          {loadError}
        </StateMessage>
      </div>
    )
  }

  return (
    <div className={`${page.page} ${page.narrow}`}>
      <header className={page.header}>
        <p className={page.eyebrow}>Open ended assessment</p>
        <h1 className={page.title}>Explain it in your own words</h1>
        <p className={page.lead}>
          Your answer is scored from 0 to 10 against the lesson content, with feedback on what to add.
        </p>
      </header>

      <div className={page.card}>
        <p className={page.eyebrow}>Question</p>
        {question === null ? (
          <Skeleton lines={2} height={20} label="Loading question" />
        ) : (
          <div className={styles.question}>{question}</div>
        )}

        {!result && (
          <form onSubmit={handleSubmit}>
            <div className={page.field}>
              <label className={page.label} htmlFor="answer">
                Your answer
              </label>
              <textarea
                id="answer"
                className={`${page.input} ${styles.textarea}`}
                rows={7}
                maxLength={MAX_ANSWER}
                placeholder="Write your answer here"
                value={answer}
                onChange={(e) => setAnswer(e.target.value)}
                disabled={loading}
                aria-describedby="answer-count"
              />
              <span id="answer-count" className={styles.count}>
                {answer.length} of {MAX_ANSWER} characters
              </span>
            </div>
            {error && (
              <p className={page.error} role="alert">
                {error}
              </p>
            )}
            <div className={page.actions}>
              <button
                type="submit"
                className={`${page.btn} ${page.btnPrimary}`}
                disabled={loading || !answer.trim() || question === null}
              >
                {loading ? 'Evaluating…' : 'Submit answer'}
              </button>
              <button type="button" className={page.btn} onClick={() => navigate(-1)}>
                Back
              </button>
            </div>
          </form>
        )}
      </div>

      {result && (
        <section className={page.card} aria-labelledby="result-title" aria-live="polite">
          <h2 id="result-title" className={page.eyebrow}>
            Evaluation
          </h2>
          <div className={`${styles.score} ${scoreTone(result.score)}`}>
            <span className={styles.scoreValue}>{result.score}</span>
            <span className={styles.scoreOf}>out of 10</span>
            <span className={styles.category}>{result.category}</span>
          </div>
          <span
            className={`${page.bar} ${styles.scoreBar}`}
            role="progressbar"
            aria-label="Score"
            aria-valuemin={0}
            aria-valuemax={10}
            aria-valuenow={result.score}
          >
            <span
              className={`${page.fill} ${styles.scoreFill} ${scoreTone(result.score)}`}
              style={{ width: `${result.score * 10}%` }}
            />
          </span>

          <h3 className={styles.subhead}>Feedback</h3>
          <Markdown className="md-chat">{result.feedback}</Markdown>

          {result.key_points.length > 0 && (
            <>
              <h3 className={styles.subhead}>Key points to cover</h3>
              <ul className={styles.points}>
                {result.key_points.map((pt, i) => (
                  <li key={i}>{pt}</li>
                ))}
              </ul>
            </>
          )}

          <div className={page.actions}>
            <button
              type="button"
              className={`${page.btn} ${page.btnPrimary}`}
              onClick={() => {
                setResult(null)
                setAnswer('')
              }}
            >
              Try again
            </button>
            <Link to={`/scenario/${nodeId}`} className={page.btn}>
              Scenario quiz
            </Link>
            <button type="button" className={page.btn} onClick={() => navigate(-1)}>
              Back
            </button>
          </div>
        </section>
      )}
    </div>
  )
}
