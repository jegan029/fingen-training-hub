import { Link, useNavigate, type LinkProps } from 'react-router-dom'
import { navigateWithTransition } from '../lib/motion'

interface TransitionLinkProps extends LinkProps {
  /** Selector of a shared element on the new page to wait for (see navigateWithTransition). */
  waitFor?: string
}

/** A router Link that changes page inside a View Transition. Takes every Link prop. */
export default function TransitionLink({ onClick, to, replace, state, target, waitFor, ...rest }: TransitionLinkProps) {
  const navigate = useNavigate()

  const handleClick = (e: React.MouseEvent<HTMLAnchorElement>) => {
    onClick?.(e)
    // Leave new tab, new window and download clicks to the browser.
    const modified = e.metaKey || e.altKey || e.ctrlKey || e.shiftKey
    if (e.defaultPrevented || e.button !== 0 || modified || (target && target !== '_self')) return
    e.preventDefault()
    navigateWithTransition(navigate, to, { replace, state, waitFor })
  }

  return <Link to={to} replace={replace} state={state} target={target} onClick={handleClick} {...rest} />
}
