import type { ComponentProps } from 'react'
import { Link, useInRouterContext } from 'react-router-dom'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import rehypeSanitize from 'rehype-sanitize'
import page from '../styles/page.module.css'

interface MarkdownProps {
  children: string
  className?: string
}

/** In app links navigate inside the SPA; API links (downloads) and external links are plain anchors. */
function MarkdownLink({ href = '', children, node: _node, ...rest }: ComponentProps<'a'> & { node?: unknown }) {
  const inRouter = useInRouterContext()
  const internal = href.startsWith('/') && !href.startsWith('//')
  if (internal && inRouter && !href.startsWith('/api/')) {
    return (
      <Link to={href} {...rest}>
        {children}
      </Link>
    )
  }
  if (internal) {
    return (
      <a href={href} {...rest}>
        {children}
      </a>
    )
  }
  return (
    <a href={href} target="_blank" rel="noopener noreferrer" {...rest}>
      {children}
      <span className={page.srOnly}> (opens in a new tab)</span>
    </a>
  )
}

/**
 * The only way this app renders rich text (lesson content, AI tutor replies, knowledge articles).
 * react-markdown never uses innerHTML, raw HTML in the source is ignored, and
 * rehype-sanitize (GitHub's default schema) strips anything unsafe that remains,
 * such as javascript: URLs.
 */
export default function Markdown({ children, className }: MarkdownProps) {
  return (
    <div className={className ? `md ${className}` : 'md'}>
      <ReactMarkdown remarkPlugins={[remarkGfm]} rehypePlugins={[rehypeSanitize]} components={{ a: MarkdownLink }}>
        {children}
      </ReactMarkdown>
    </div>
  )
}
