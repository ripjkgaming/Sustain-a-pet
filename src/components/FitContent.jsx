import { useLayoutEffect, useRef } from 'react'

/**
 * Fit a screen's content into its available space, so nothing is clipped and nothing scrolls.
 * The content is laid out at its natural size, then scaled down (never up) to fit the frame's
 * content box. It re-fits when fonts, the keyboard or the content change its size.
 * align="center" centres content that is shorter than the frame; "start" keeps it at the top.
 */
export default function FitContent({ children, className = '', align = 'start' }) {
  const frame = useRef(null)
  const content = useRef(null)
  useLayoutEffect(() => {
    const outer = frame.current
    const inner = content.current
    const fit = () => {
      const cs = getComputedStyle(outer)
      const padTop = parseFloat(cs.paddingTop) || 0
      const padBottom = parseFloat(cs.paddingBottom) || 0
      const available = outer.clientHeight - padTop - padBottom
      const needed = inner.offsetHeight
      const scale = needed > 0 && available > 0 ? Math.min(1, available / needed) : 1
      const offset = align === 'center' ? Math.max(0, (available - needed * scale) / 2) : 0
      inner.style.top = `${padTop}px`
      inner.style.left = cs.paddingLeft
      inner.style.right = cs.paddingRight
      inner.style.transform = `translateY(${offset}px) scale(${scale})`
      outer.scrollTop = 0
      outer.scrollLeft = 0
    }
    // Focus or scrollIntoView can scroll an overflow-hidden box; keep the frame pinned.
    const pin = () => { if (outer.scrollTop || outer.scrollLeft) { outer.scrollTop = 0; outer.scrollLeft = 0 } }
    const observer = new ResizeObserver(fit)
    observer.observe(outer)
    observer.observe(inner)
    outer.addEventListener('scroll', pin)
    fit()
    return () => { observer.disconnect(); outer.removeEventListener('scroll', pin) }
  }, [align])
  return <div ref={frame} className={`fit-frame ${className}`}><div ref={content} className="fit-content">{children}</div></div>
}
