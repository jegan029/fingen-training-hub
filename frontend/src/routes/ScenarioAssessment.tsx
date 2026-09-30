import { useEffect, useState } from 'react'
import { useParams, Link } from 'react-router-dom'
import { Check, CheckCircle2, Lightbulb, X, XCircle } from 'lucide-react'
import { fetchScenarioQuestion, submitScenario } from '../api'
import type { ScenarioQuestion, ScenarioResult } from '../types'
import Skeleton from '../components/ui/Skeleton'
import StateMessage from '../components/ui/StateMessage'
import page from '../styles/page.module.css'
import styles from './Assessment.module.css'

const OPTION_LABELS = ['A', 'B', 'C', 'D', 'E', 'F']

export default function ScenarioAssessment() {
  const { nodeId } = useParams<{ nodeId: string }>()
  const [question, setQuestion] = useState<ScenarioQuestion | null>(null)
  const [selected, setSelected] = useState<number | null>(null)
  const [result, setResult] = useState<ScenarioResult | null>(null)
  const [loading, setLoading] = useState(false)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!nodeId) return
    fetchScenarioQuestion(Number(nodeId))
      .then(setQuestion)
      .catch((err: Error) => setLoadError(err.message || 'Unable to load the scenario'))
  }, [nodeId])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (selected === null || !nodeId) return
    setLoading(true)
    setError(null)
    try {
      setResult(await submitScenario(Number(nodeId), selected))
    } catch (err) {
      setError((err as Error).message || 'Could not check your answer')
    } finally {
      setLoading(false)
    }
  }

  const handleRetry = () => {
    setSelected(null)
    setResult(null)
  }

  if (loadError) {
    return (
      <div className={`${page.page} ${page.narrow}`}>
        <StateMessage
          tone="error"
          title="This scenario is not available"
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

  if (!question) {
    return (
      <div className={`${page.page} ${page.narrow}`}>
        <Skeleton lines={5} height={36} label="Loading scenario" />
      </div>
    )
  }

  return (
    <div className={`${page.page} ${page.narrow}`}>
      <nav className={page.crumbs} aria-label="Breadcrumb">
        <Link to="/roadmaps">Training paths</Link>
        <span aria-hidden="true">›</span>
        <span>Scenario: {question.node_title}</span>
      </nav>

      <header className={page.header}>
        <p className={page.eyebrow}>Scenario quiz</p>
        <h1 className={page.title}>{question.node_title}</h1>
      </header>

      <div className={page.card}>
        <p className={page.eyebrow}>Scenario</p>
        <p className={styles.context}>{question.context}</p>

        {!result ? (
          <form onSubmit={handleSubmit}>
            <fieldset className={styles.options}>
              <legend className={styles.legend}>What is the correct action? Choose one.</legend>
              {question.options.map((opt, i) => (
                <label key={i} className={styles.option}>
                  <input
                    type="radio"
                    name="scenario-option"
                    value={i}
                    checked={selected === i}
                    onChange={() => setSelected(i)}
                  />
                  <span className={styles.letter} aria-hidden="true">
                    {OPTION_LABELS[i]}
                  </span>
                  <span className={styles.optionText}>{opt}</span>
                </label>
              ))}
            </fieldset>
            {error && (
              <p className={page.error} role="alert">
                {error}
              </p>
            )}
            <button type="submit" className={`${page.btn} ${page.btnPrimary}`} disabled={selected === null || loading}>
              {loading ? 'Checking…' : 'Submit answer'}
            </button>
          </form>
        ) : (
          <div aria-live="polite">
            <div className={`${styles.outcome} ${result.is_correct ? styles.good : styles.poor}`}>
              {result.is_correct ? (
                <CheckCircle2 size={28} aria-hidden="true" />
              ) : (
                <XCircle size={28} aria-hidden="true" />
              )}
              <div>
                <p className={styles.outcomeTitle}>{result.is_correct ? 'Correct' : 'Not quite right'}</p>
                <p className={styles.outcomeText}>
                  {result.is_correct
                    ? 'You picked the right course of action.'
                    : `The correct answer was option ${OPTION_LABELS[result.correct_option]}.`}
                </p>
              </div>
            </div>

            <ul className={styles.review} aria-label="Answer review">
              {question.options.map((opt, i) => {
                const isCorrect = i === result.correct_option
                const wasChosen = i === result.chosen_option
                const tone = isCorrect ? styles.good : wasChosen ? styles.poor : ''
                return (
                  <li key={i} className={`${styles.reviewItem} ${tone}`}>
                    <span className={styles.letter} aria-hidden="true">
                      {isCorrect ? <Check size={14} /> : wasChosen ? <X size={14} /> : OPTION_LABELS[i]}
                    </span>
                    <span className={styles.optionText}>
                      <span className={page.srOnly}>
                        Option {OPTION_LABELS[i]}
                        {isCorrect ? ', correct answer' : ''}
                        {wasChosen ? ', your choice' : ''}.{' '}
                      </span>
                      {opt}
                    </span>
                  </li>
                )
              })}
            </ul>

            <div className={styles.explanation}>
              <p className={page.eyebrow}>
                <Lightbulb size={14} aria-hidden="true" /> Explanation
              </p>
              <p>{result.explanation}</p>
            </div>

            <div className={page.actions}>
              <button type="button" className={`${page.btn} ${page.btnPrimary}`} onClick={handleRetry}>
                Try again
              </button>
              <Link to={`/assessment/${nodeId}`} className={page.btn}>
                Open ended quiz
              </Link>
              <Link to="/roadmaps" className={page.btn}>
                Back to training paths
              </Link>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
