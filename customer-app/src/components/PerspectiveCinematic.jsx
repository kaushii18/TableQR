import { useState, useRef } from 'react'
import StarPortalButton from './StarPortalButton'
import './PerspectiveCinematic.css'

export default function PerspectiveCinematic({ onEnterMenu, tableNumber, onOpenTableModal }) {
  const stageRef = useRef(null)
  const [tilt, setTilt] = useState({ rx: 6, ry: -8, mx: 50, my: 50 })
  const [isHovered, setIsHovered] = useState(false)

  // Mouse parallax tracking for cinematic 3D perspective
  function handleMouseMove(e) {
    if (!stageRef.current) return
    const rect = stageRef.current.getBoundingClientRect()
    const x = e.clientX - rect.left
    const y = e.clientY - rect.top
    const px = x / rect.width
    const py = y / rect.height

    const ry = (px - 0.5) * 20
    const rx = (0.5 - py) * 16

    setTilt({
      rx: Number(rx.toFixed(2)),
      ry: Number(ry.toFixed(2)),
      mx: Number((px * 100).toFixed(1)),
      my: Number((py * 100).toFixed(1)),
    })
  }

  function handleMouseLeave() {
    setIsHovered(false)
    setTilt({ rx: 5, ry: -6, mx: 50, my: 50 })
  }

  function handleMouseEnter() {
    setIsHovered(true)
  }

  return (
    <section className="cinematic-section">
      {/* Background Dimmer & Lighting */}
      <div className="cinematic-backdrop">
        <div className="cinematic-glow gold" />
        <div className="cinematic-glow cyan" />
      </div>

      {/* Hero Branding Shield (Crisp, High-Contrast & Proudly Visible) */}
      <div className="hero-branding-shield">
        <div className="brand-crest">
          <span className="crest-star">✦</span>
          <span className="crest-kicker">VIRAR WEST'S PREMIER DINING DESTINATION</span>
          <span className="crest-star">✦</span>
        </div>
        <h1 className="brand-hero-title">STAR PLANET</h1>
        <p className="brand-hero-subtitle">FAMILY RESTAURANT & BAR</p>
        <div className="brand-chips-row">
          <span className="brand-chip">📍 Y K Nagar, Virar (W)</span>
          <span className="brand-chip highlight">✨ Table Digital Ordering</span>
          <span className="brand-chip">⏰ Open Till 1:30 AM</span>
        </div>
      </div>

      {/* 3D Perspective Glass Stage (Translucent: Lets the Hotel Image Shine Through!) */}
      <div
        className="perspective-stage"
        ref={stageRef}
        onMouseMove={handleMouseMove}
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
      >
        <div
          className={`perspective-card-group ${isHovered ? 'hovered' : 'floating'}`}
          style={{
            transform: `rotateX(${tilt.rx}deg) rotateY(${tilt.ry}deg)`,
            '--mouse-x': `${tilt.mx}%`,
            '--mouse-y': `${tilt.my}%`,
          }}
        >
          {/* Main Translucent Glass Card */}
          <div className="perspective-glass-card">
            <div className="glass-specular-sheen" />

            <div className="glass-card-top">
              <div className="table-live-indicator">
                <span className="live-status-dot" />
                <span>
                  {tableNumber ? (
                    <>
                      DINING AT <strong>TABLE {tableNumber}</strong>
                    </>
                  ) : (
                    'TABLE NOT SET'
                  )}
                </span>
              </div>

              <button
                type="button"
                className="table-change-glass-btn"
                onClick={onOpenTableModal}
              >
                {tableNumber ? 'Change Table ✏️' : 'Set Table #'}
              </button>
            </div>

            <div className="glass-card-center">
              <h2>Welcome to Star Planet</h2>
              <p>
                Browse 380+ authentic North Indian curries, tandoori kebabs, Chinese wok
                specialties, and refreshing bar drinks. Freshly prepared and delivered right to your table.
              </p>
            </div>

            {/* Quick Stats in a clean, non-obtrusive row */}
            <div className="glass-perks-row">
              <div className="glass-perk-item">
                <span>⚡</span>
                <small>Instant Kitchen Transmit</small>
              </div>
              <div className="glass-perk-item">
                <span>🥘</span>
                <small>380+ Fresh Dishes</small>
              </div>
              <div className="glass-perk-item">
                <span>🍸</span>
                <small>Full Bar & Mocktails</small>
              </div>
            </div>

            {/* CTA Button nestled with 3D depth */}
            <div className="glass-cta-row">
              <StarPortalButton
                size="hero"
                startIcon="✦"
                endIcon="➔"
                onClick={onEnterMenu}
              >
                EXPLORE FULL MENU & ORDER
              </StarPortalButton>
            </div>
          </div>
        </div>
      </div>

      {/* Jump to Menu Quick Link */}
      <div className="cinematic-jump-bar">
        <button className="cinematic-jump-btn" onClick={onEnterMenu}>
          View Full Menu Directly ({tableNumber ? `Table ${tableNumber}` : 'Browse Dishes'}) ↓
        </button>
      </div>
    </section>
  )
}
