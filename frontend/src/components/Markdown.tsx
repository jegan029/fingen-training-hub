import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import rehypeSanitize from 'rehype-sanitize'

interface MarkdownProps {
  children: string
  className?: string
}

/**
 * The only way this app renders rich text (lesson content, AI tutor replies).
 * react-markdown never uses innerHTML, raw HTML in the source is ignored, and
 * rehype-sanitize (GitHub's default schema) strips anything unsafe that remains,
 * such as javascript: URLs.
 */
export default function Markdown({ children, className }: MarkdownProps) {
  return (
    <div className={className ? `md ${className}` : 'md'}>
      <ReactMarkdown remarkPlugins={[remarkGfm]} rehypePlugins={[rehypeSanitize]}>
        {children}
      </ReactMarkdown>
    </div>
  )
}
