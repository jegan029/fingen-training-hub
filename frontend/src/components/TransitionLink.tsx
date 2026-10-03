import { Link, useNavigate, type LinkProps } from 'react-router-dom'
import { navigateWithTransition } from '../lib/motion'

/** A router Link that changes page inside a View Transition. Same props as Link. */
export default function TransitionLink({ onClick, to, replace, state, target, ...rest }: LinkProps) {
  const navigate = useNavigate()

  const handleClick = (e: React.MouseEvent<HTMLAnchorElement>) => {
    onClick?.(e)
    // Leave new tab, new window and download clicks to the browser.
    const modified = e.metaKey || e.altKey || e.ctrlKey || e.shiftKey
    if (e.defaultPrevented || e.button !== 0 || modified || (target && target !== '_self')) return
    e.preventDefault()
    navigateWithTransition(navigate, to, { replace, state })
  }

  return <Link to={to} replace={replace} state={state} target={target} onClick={handleClick} {...rest} />
}
