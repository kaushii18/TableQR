import { useState, useRef, useEffect } from 'react'
import StarPortalButton from './StarPortalButton'
import './PerspectiveCinematic.css'

export default function PerspectiveCinematic({ onEnterMenu, tableNumber, onOpenTableModal }) {
  const stageRef = useRef(null)
  const [tilt, setTilt] = useState({ rx: 8, ry: -10, mx: 50, my: 50 })
  const [isHovered, setIsHovered] = useState(false)

  // Mouse parallax tracking for cinematic 3D perspective
  function handleMouseMove(e) {
    if (!stageRef.current) return
    const rect = stageRef.current.getBoundingClientRect()
    const x = e.clientX - rect.left
    const y = e.clientY - rect.top
    const px = x / rect.width
    const py = y / rect.height

    // Calculate rotation angles (max +/- 14 degrees)
    const ry = (px - 0.5) * 24
    const rx = (0.5 - py) * 20

    setTilt({
      rx: Number(rx.toFixed(2)),
      ry: Number(ry.toFixed(2)),
      mx: Number((px * 100).toFixed(1)),
      my: Number((py * 100).toFixed(1)),
    })
  }

  function handleMouseLeave() {
    setIsHovered(false)
    setTilt({ rx: 6, ry: -8, mx: 50, my: 50 })
  }

  function handleMouseEnter() {
    setIsHovered(true)
  }

  return (
    <section className="cinematic-section">
      {/* Background Ambient Glow & Star Grid */}
      <div className="cinematic-backdrop">
        <div className="cinematic-glow gold" />
        <div className="cinematic-glow cyan" />
        <div className="cinematic-grid" />
      </div>

      {/* Header Info */}
      <div className="cinematic-eyebrow">
        <span className="cinematic-star-badge">✦ STAR PLANET DIGITAL DINING</span>
        <span className="cinematic-pill-info">
          {tableNumber ? `Dine-In • Table ${tableNumber}` : 'QR Table Ordering'}
        </span>
      </div>

      <h1 className="cinematic-title">
        Experience Flavors.<br />
        <span className="cinematic-title-gradient">Elevated in 3D Perspective.</span>
      </h1>

      <p className="cinematic-subtitle">
        Scan, browse 380+ handcrafted Indian, Tandoori & Chinese delicacies,
        and transmit your order straight to the kitchen.
      </p>

      {/* 3D Perspective Stage */}
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
          {/* Main 3D Panel */}
          <div className="perspective-main-panel">
            <div className="panel-specular-sheen" />
            
            <div className="panel-header">
              <div className="panel-brand">
                <span className="panel-star">✦</span>
                <div>
                  <strong>STAR PLANET</strong>
                  <small>Family Restaurant & Bar</small>
                </div>
              </div>
              <span className="panel-status-chip">
                <span className="status-live-dot" /> LIVE MENU
              </span>
            </div>

            {/* Featured Dish Preview */}
            <div className="panel-body">
              <div className="panel-dish-preview">
                <div className="dish-img-mock">
                  <div className="dish-tag">👑 CHEF'S SIGNATURE</div>
                  <div className="dish-title-wrap">
                    <h3>Murgh Dum Biryani & Tandoori Kebab</h3>
                    <p>Slow-cooked saffron basmati rice with charcoal-grilled spiced kebabs</p>
                  </div>
                  <div className="dish-meta-row">
                    <span className="dish-price-badge">₹395</span>
                    <span className="dish-diet-pill nonveg">Non-Veg</span>
                  </div>
                </div>
              </div>
            </div>

            <div className="panel-footer">
              <div className="panel-perk">
                <span>⚡</span>
                <small>Instant Kitchen Transmit</small>
              </div>
              <div className="panel-perk">
                <span>🍽️</span>
                <small>380+ Fresh Dishes</small>
              </div>
              <div className="panel-perk">
                <span>🍸</span>
                <small>Full Bar & Mocktails</small>
              </div>
            </div>
          </div>

          {/* Floating Layer 1 (Top-Right, Z: 48px) - Table Tracker */}
          <div className="perspective-floating-layer layer-table">
            <div className="floating-card-pill">
              <span className="floating-icon">🪑</span>
              <div>
                <b>{tableNumber ? `Table ${tableNumber}` : 'Seated at Table?'}</b>
                <small>{tableNumber ? 'Connected to Kitchen' : 'Tap to assign table'}</small>
              </div>
              {!tableNumber && (
                <button
                  type="button"
                  className="layer-btn-small"
                  onClick={onOpenTableModal}
                >
                  Set #
                </button>
              )}
            </div>
          </div>

          {/* Floating Layer 2 (Bottom-Left, Z: 64px) - Service Call */}
          <div className="perspective-floating-layer layer-service">
            <div className="floating-card-pill">
              <span className="floating-icon pulse">🔔</span>
              <div>
                <b>1-Tap Captain Call</b>
                <small>Water • Cutlery • Bill</small>
              </div>
            </div>
          </div>

          {/* Floating Layer 3 (Z: 85px) - Star Portal Holographic Button */}
          <div className="perspective-floating-layer layer-cta">
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

      {/* Quick Navigation Scroll cue */}
      <div className="cinematic-bottom-actions">
        <button className="cinematic-skip-btn" onClick={onEnterMenu}>
          Jump Directly to Menu ({tableNumber ? `Table ${tableNumber}` : 'Browse'}) ↓
        </button>
      </div>
    </section>
  )
}
