import { photoSources, type PhotoName } from '../assets/images'

interface PictureProps {
  photo: PhotoName
  alt: string
  /** Intrinsic size (16:9) so the browser reserves space before the image loads. */
  width?: number
  height?: number
  /** Rendered width hint for choosing a source, e.g. "(max-width: 768px) 100vw, 400px". */
  sizes: string
  /** Lazy by default; pass true for images visible on first paint. */
  priority?: boolean
  className?: string
}

/** AVIF first, WebP next; explicit dimensions prevent layout shift. */
export default function Picture({
  photo,
  alt,
  width = 800,
  height = 450,
  sizes,
  priority = false,
  className,
}: PictureProps) {
  const src = photoSources(photo)
  return (
    <picture>
      <source type="image/avif" srcSet={src.avif} sizes={sizes} />
      <source type="image/webp" srcSet={src.webp} sizes={sizes} />
      <img
        src={src.fallback}
        alt={alt}
        width={width}
        height={height}
        loading={priority ? 'eager' : 'lazy'}
        decoding="async"
        // React 18 does not know fetchPriority; the lowercase attribute passes straight through.
        {...(priority ? { fetchpriority: 'high' } : {})}
        className={className}
      />
    </picture>
  )
}
