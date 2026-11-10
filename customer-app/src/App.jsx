import { useState, useMemo, useEffect } from 'react'
import { categories, categoryMeta, menuItems } from './data/menuData'
import { createOrder, createServiceRequest, isSupabaseConfigured } from './lib/supabase'
import './App.css'

const categoryCounts = {
  'Soups & Salads': 34,
  Starters: 75,
  'Main Course': 8,
  'Rice & Biryani': 30,
  'Noodles & Fried Rice': 40,
  'Breads & Rotis': 30,
  'Pizza, Pasta & Sandwiches': 18,
  'Bar Bites & Snacks': 34,
  Desserts: 27,
  'Beverages & Shakes': 10,
}

function getCategoryId(category) {
  return `menu-category-${category.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`
}

export default function App() {
  // Table detection from URL ?table=...
  const urlTable = new URLSearchParams(window.location.search).get('table') || ''
  const [tableNumber, setTableNumber] = useState(urlTable)
  const [tableModalOpen, setTableModalOpen] = useState(false)
  const [tempTableInput, setTempTableInput] = useState('')

  // Menu filters & search
  const [activeCategory, setActiveCategory] = useState('All')
  const [dietFilter, setDietFilter] = useState('All') // 'All' | 'Veg' | 'Non-Veg' | 'Egg'
  const [search, setSearch] = useState('')

  // Cart state
  const [cart, setCart] = useState([])
  const [cartOpen, setCartOpen] = useState(false)
  const [specialInstructions, setSpecialInstructions] = useState('')

  // Checkout & Customer details
  const [checkoutOpen, setCheckoutOpen] = useState(false)
  const [customer, setCustomer] = useState({
    name: '',
    phone: '',
    paymentMethod: 'UPI', // 'UPI' | 'Counter'
    orderUpdates: true,
  })

  // Order state
  const [placedOrder, setPlacedOrder] = useState(null)

  // Service / Waiter Call state
  const [serviceModalOpen, setServiceModalOpen] = useState(false)
  const [toastMessage, setToastMessage] = useState('')

  // Trigger brief toast message
  function showToast(msg) {
    setToastMessage(msg)
    setTimeout(() => setToastMessage(''), 3000)
  }

  // Filter menu items dynamically
  const filteredMenu = useMemo(() => {
    return menuItems.filter(item => {
      const matchDiet = dietFilter === 'All' || item.type === dietFilter
      const query = search.trim().toLowerCase()
      const matchSearch = !query ||
        item.name.toLowerCase().includes(query) ||
        item.category.toLowerCase().includes(query) ||
        (item.description && item.description.toLowerCase().includes(query))
      return matchDiet && matchSearch
    })
  }, [dietFilter, search])

  const groupedMenu = useMemo(
    () => categories.slice(1)
      .map(category => ({
        category,
        items: filteredMenu.filter(item => item.category === category),
      }))
      .filter(section => section.items.length > 0),
    [filteredMenu],
  )

  useEffect(() => {
    const sections = document.querySelectorAll('[data-menu-category]')
    if (!sections.length || !('IntersectionObserver' in window)) return undefined

    const observer = new IntersectionObserver((entries) => {
      const visibleSections = entries
        .filter(entry => entry.isIntersecting)
        .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top)

      if (visibleSections[0]) {
        setActiveCategory(visibleSections[0].target.dataset.menuCategory)
      }
    }, { rootMargin: '-18% 0px -68% 0px' })

    sections.forEach(section => observer.observe(section))
    return () => observer.disconnect()
  }, [groupedMenu])

  // Cart calculations
  const cartCount = cart.reduce((sum, ci) => sum + ci.quantity, 0)
  const subtotal = cart.reduce((sum, ci) => sum + ci.item.price * ci.quantity, 0)
  const tax = Math.round(subtotal * 0.05) // 5% GST
  const grandTotal = subtotal + tax

  function getQuantity(itemId) {
    const found = cart.find(ci => ci.item.id === itemId)
    return found ? found.quantity : 0
  }

  function addToCart(item) {
    setCart(curr => {
      const existing = curr.find(ci => ci.item.id === item.id)
      if (existing) {
        return curr.map(ci =>
          ci.item.id === item.id ? { ...ci, quantity: ci.quantity + 1 } : ci
        )
      }
      return [...curr, { item, quantity: 1 }]
    })
    showToast(`Added ${item.name} to cart`)
  }

  function changeQuantity(itemId, amount) {
    setCart(curr => {
      return curr
        .map(ci => {
          if (ci.item.id === itemId) {
            return { ...ci, quantity: ci.quantity + amount }
          }
          return ci
        })
        .filter(ci => ci.quantity > 0)
    })
  }

  function handleSaveTable(e) {
    e.preventDefault()
    if (tempTableInput.trim()) {
      setTableNumber(tempTableInput.trim())
      setTableModalOpen(false)
      showToast(`Dining at Table ${tempTableInput.trim()}`)
    }
  }

  async function handlePlaceOrder(e) {
    e.preventDefault()

    if (!tableNumber) {
      setCheckoutOpen(false)
      setTempTableInput('')
      setTableModalOpen(true)
      showToast('Please enter your table number first')
      return
    }

    const orderData = {
      orderId: 'SP' + Math.floor(100000 + Math.random() * 900000),
      table: tableNumber,
      customerName: customer.name,
      customerPhone: customer.phone,
      paymentMethod: customer.paymentMethod,
      items: [...cart],
      instructions: specialInstructions,
      subtotal,
      tax,
      total: grandTotal,
      time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      date: new Date().toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }),
    }

    // Persist to Supabase and LocalStorage
    await createOrder(orderData)

    setPlacedOrder(orderData)
    setCart([])
    setSpecialInstructions('')
    setCheckoutOpen(false)
    setCartOpen(false)
  }

  async function handleCallWaiter(serviceType) {
    const tableStr = tableNumber ? `Table ${tableNumber}` : 'your table'
    if (tableNumber) {
      await createServiceRequest(tableNumber, serviceType)
    }
    setServiceModalOpen(false)
    showToast(`Captain notified for ${serviceType} at ${tableStr}`)
  }

  return (
    <div className="app">
      {/* Toast Notification */}
      {toastMessage && (
        <div className="toast-notification">
          <span>✦ {toastMessage}</span>
        </div>
      )}

      {/* Top Announcement Bar */}
      <div className="top-banner">
        <div className="top-banner-content">
          <span>✨ <b>STAR PLANET FAMILY RESTAURANT & BAR</b> • VIRAR WEST</span>
          <span className="banner-badge">TABLE DIGITAL ORDERING</span>
        </div>
      </div>

      {/* Main Navigation Header */}
      <header className="navbar">
        <div className="nav-left">
          <a href="#home" className="brand">
            <span className="brand-star">✦</span>
            <div className="brand-text">
              <span className="brand-title">STAR <b>PLANET</b></span>
              <span className="brand-subtitle">FAMILY RESTAURANT & BAR</span>
            </div>
          </a>
        </div>

        <div className="nav-center">
          <nav>
            <a href="#menu" className="nav-link">Full Menu</a>
            <a href="#specials" className="nav-link">Chef Specials</a>
            <a href="#about" className="nav-link">About & Directions</a>
          </nav>
        </div>

        <div className="nav-right">
          {/* Table Chip / Selector */}
          <button
            className={`table-chip ${tableNumber ? 'active' : 'unassigned'}`}
            onClick={() => {
              setTempTableInput(tableNumber)
              setTableModalOpen(true)
            }}
            title="Click to set or change table"
          >
            <span className="table-chip-icon">🪑</span>
            <span>{tableNumber ? `Table ${tableNumber}` : 'Set Table #'}</span>
          </button>

          {/* Call Waiter Button */}
          <button
            className="waiter-button"
            onClick={() => setServiceModalOpen(true)}
            title="Request Service or Waiter"
          >
            🔔 <span className="waiter-label">Service</span>
          </button>

          {/* Cart Trigger */}
          <button
            className="cart-button"
            onClick={() => setCartOpen(true)}
            aria-label="View Cart"
          >
            <span className="cart-icon">🛒</span>
            <span className="cart-title">Order</span>
            <span className="cart-badge">{cartCount}</span>
          </button>
        </div>
      </header>

      {/* Hero Welcome Section */}
      <section className="hero" id="home">
        <div className="hero-overlay"></div>
        <div className="hero-content">
          <div className="hero-eyebrow">
            <span className="gold-dot">●</span> VIRAR’S PREMIER DINING DESTINATION
          </div>
          <h1>
            Experience Flavors.<br />
            <em>Celebrate Moments.</em>
          </h1>
          <p className="hero-desc">
            Savor authentic North Indian, Tandoori sizzlers, Chinese wok dishes,
            coastal seafood & refreshing bar beverages. Freshly prepared to order right at your table.
          </p>

          <div className="hero-actions">
            <a href="#menu" className="btn-primary">
              EXPLORE FULL MENU ({menuItems.length} ITEMS) ↓
            </a>
            <button
              className="btn-secondary"
              onClick={() => {
                setTempTableInput(tableNumber)
                setTableModalOpen(true)
              }}
            >
              {tableNumber ? `Dine-In: Table ${tableNumber} (Edit)` : 'Enter Your Table Number'}
            </button>
          </div>

          <div className="hero-perks">
            <div className="perk-item">
              <span className="perk-icon">🥘</span>
              <div>
                <strong>380+ Authentic Dishes</strong>
                <small>Tandoor, Curries, Chinese & Bar</small>
              </div>
            </div>
            <div className="perk-item">
              <span className="perk-icon">📱</span>
              <div>
                <strong>Instant Table QR Ordering</strong>
                <small>Direct to kitchen without waiting</small>
              </div>
            </div>
            <div className="perk-item">
              <span className="perk-icon">🍸</span>
              <div>
                <strong>Family Dining & Full Bar</strong>
                <small>Cocktails, Mocktails & Delicacies</small>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Main Menu Section */}
      <main className="menu-container" id="menu">
        <div className="menu-header">
          <div className="section-tag">STAR PLANET DIGITAL MENU</div>
          <h2>Explore Our <em>Culinary Delights</em></h2>
          <p>Browse categories, search dishes, filter dietary preferences, and order fresh food.</p>
        </div>

        {/* Search & Dietary Filter Toolbar */}
        <div className="menu-controls-wrapper">
          <div className="search-box">
            <span className="search-icon">🔍</span>
            <input
              type="search"
              placeholder="Search 380+ dishes (e.g., Ghee Roast, Biryani, Naan, Paneer, Soup)..."
              value={search}
              onChange={e => setSearch(e.target.value)}
            />
            {search && (
              <button className="clear-search" onClick={() => setSearch('')}>✕</button>
            )}
          </div>

          {/* Diet Filter Pills */}
          <div className="diet-filters">
            <button
              className={`diet-pill ${dietFilter === 'All' ? 'active' : ''}`}
              onClick={() => setDietFilter('All')}
            >
              All Dishes
            </button>
            <button
              className={`diet-pill veg ${dietFilter === 'Veg' ? 'active' : ''}`}
              onClick={() => setDietFilter('Veg')}
            >
              <span className="food-symbol veg"></span> Pure Veg
            </button>
            <button
              className={`diet-pill nonveg ${dietFilter === 'Non-Veg' ? 'active' : ''}`}
              onClick={() => setDietFilter('Non-Veg')}
            >
              <span className="food-symbol nonveg"></span> Non-Veg
            </button>
            <button
              className={`diet-pill egg ${dietFilter === 'Egg' ? 'active' : ''}`}
              onClick={() => setDietFilter('Egg')}
            >
              <span className="food-symbol egg"></span> Egg
            </button>
          </div>
        </div>

        {/* Sticky Category Tabs */}
        <div className="categories-scroll-bar">
          <nav className="categories-scroll" aria-label="Menu categories">
            {categories.slice(1).map(cat => {
              const meta = categoryMeta[cat] || { icon: '🍽️' }

              return (
                <button
                  key={cat}
                  className={`category-tab ${activeCategory === cat ? 'active' : ''}`}
                  aria-current={activeCategory === cat ? 'location' : undefined}
                  onClick={() => {
                    setActiveCategory(cat)
                    document.getElementById(getCategoryId(cat))?.scrollIntoView({
                      behavior: 'smooth',
                      block: 'start',
                    })
                  }}
                >
                  <span className="cat-icon">{meta.icon}</span>
                  <span className="cat-name">{cat}</span>
                  <span className="cat-count">{categoryCounts[cat]}</span>
                </button>
              )
            })}
          </nav>
        </div>

        {/* Menu Categories and Food Items */}
        {groupedMenu.map(({ category, items }) => (
          <section
            className="menu-category-section"
            id={getCategoryId(category)}
            data-menu-category={category}
            key={category}
          >
            <div className="menu-category-heading">
              <div>
                <span className="section-tag">{categoryMeta[category]?.icon} OUR MENU</span>
                <h3>{category}</h3>
                <p>{categoryMeta[category]?.desc}</p>
              </div>
              <span className="item-count-badge">
                {items.length} {items.length === 1 ? 'dish' : 'dishes'}
              </span>
            </div>
            <div className="food-grid">
              {items.map(item => {
                const qty = getQuantity(item.id)

                return (
                  <article className="food-card" key={item.id}>
                    <div className={`food-image-wrap ${item.image ? '' : 'image-placeholder'}`}>
                      {item.image && (
                        <img
                          src={item.image}
                          alt={item.name}
                          loading="lazy"
                          onError={e => {
                            e.currentTarget.hidden = true
                            e.currentTarget.parentElement?.classList.add('image-placeholder')
                          }}
                        />
                      )}
                      <div className="food-placeholder" aria-hidden="true">
                        <span>{categoryMeta[item.category]?.icon || '🍽️'}</span>
                        <small>Photo coming soon</small>
                      </div>
                      <div className="food-badges">
                        <span className={`symbol-badge ${item.type.toLowerCase()}`} title={item.type}>
                          <span className={`food-symbol ${item.type.toLowerCase()}`}></span>
                          <small>{item.type}</small>
                        </span>
                        {item.isChefSpecial && (
                          <span className="chef-special-badge">👑 Chef Special</span>
                        )}
                        {item.isPopular && !item.isChefSpecial && (
                          <span className="bestseller-badge">🔥 Popular</span>
                        )}
                      </div>
                    </div>

                    <div className="food-body">
                      <h4 className="food-title">{item.name}</h4>
                      {item.description && <p className="food-desc">{item.description}</p>}

                      <div className="food-footer">
                        <div className="price-tag">
                          <span className="currency">₹</span>
                          <span className="amount">{item.price}</span>
                        </div>

                        {qty === 0 ? (
                          <button
                            className="btn-add-food"
                            onClick={() => addToCart(item)}
                          >
                            + ADD
                          </button>
                        ) : (
                          <div className="card-qty-controller">
                            <button
                              className="qty-btn"
                              onClick={() => changeQuantity(item.id, -1)}
                              aria-label="Decrease quantity"
                            >
                              −
                            </button>
                            <span className="qty-number">{qty}</span>
                            <button
                              className="qty-btn"
                              onClick={() => changeQuantity(item.id, 1)}
                              aria-label="Increase quantity"
                            >
                              +
                            </button>
                          </div>
                        )}
                      </div>
                    </div>
                  </article>
                )
              })}
            </div>
          </section>
        ))}

        {/* Empty Search Results */}
        {filteredMenu.length === 0 && (
          <div className="empty-results">
            <span className="empty-icon">🍽️</span>
            <h3>No dishes found</h3>
            <p>We couldn't find any dish matching "{search}" with current filters.</p>
            <button
              className="btn-secondary"
              onClick={() => {
                setSearch('')
                setDietFilter('All')
                setActiveCategory('All')
              }}
            >
              Reset All Filters
            </button>
          </div>
        )}
      </main>

      {/* Restaurant Highlights & About Section */}
      <section className="about-section" id="about">
        <div className="about-grid">
          <div className="about-info">
            <span className="about-tag">AUTHENTIC HOSPITALITY</span>
            <h2>Star Planet <em>Family Restaurant & Bar</em></h2>
            <p>
              Located in the heart of Virar West, Star Planet offers a vibrant ambience,
              warm family dining, and an extensive bar menu. Whether you are craving
              smoky tandoor kebabs, rich butter gravies, wok-tossed noodles, or chilled draught beer,
              our chefs prepare each delicacy with high quality and care.
            </p>

            <div className="location-details">
              <div className="loc-row">
                <span className="loc-icon">📍</span>
                <div>
                  <strong>Address</strong>
                  <p>Y K Nagar, Virar West, Palghar, Maharashtra 401303</p>
                </div>
              </div>
              <div className="loc-row">
                <span className="loc-icon">⏰</span>
                <div>
                  <strong>Dining Hours</strong>
                  <p>Open Daily: 11:00 AM – 01:30 AM (Midnight Bar & Kitchen)</p>
                </div>
              </div>
              <div className="loc-row">
                <span className="loc-icon">📞</span>
                <div>
                  <strong>Reservations & Enquiries</strong>
                  <p>Dine-In • Takeaway • Private Parties & Family Dinners</p>
                </div>
              </div>
            </div>

            <div className="about-actions">
              <a
                href="https://maps.app.goo.gl/Ao1u12QoU8rcesXk6"
                target="_blank"
                rel="noreferrer"
                className="btn-map"
              >
                🗺️ Get Google Maps Directions ↗
              </a>
            </div>
          </div>

          <div className="about-card-banner">
            <div className="banner-badge-box">
              <span className="big-star">✦</span>
              <h3>Premium Dining Experience</h3>
              <p>Scan QR • Order Instantly • Relax & Enjoy</p>
              <div className="banner-stats">
                <div>
                  <b>380+</b>
                  <small>Menu Items</small>
                </div>
                <div>
                  <b>10</b>
                  <small>Cuisine Sections</small>
                </div>
                <div>
                  <b>100%</b>
                  <small>Freshly Cooked</small>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="footer">
        <div className="footer-top">
          <div className="footer-brand">
            <span className="footer-star">✦</span>
            <h3>STAR <b>PLANET</b></h3>
            <p>Family Restaurant & Bar • Virar West</p>
          </div>
          <div className="footer-links">
            <a href="#home">Home</a>
            <a href="#menu">Menu</a>
            <a href="#about">About & Location</a>
            <a href="https://maps.app.goo.gl/Ao1u12QoU8rcesXk6" target="_blank" rel="noreferrer">Google Maps</a>
          </div>
        </div>
        <div className="footer-bottom">
          <p>© {new Date().getFullYear()} Star Planet Family Restaurant & Bar. All rights reserved.</p>
          <small>TableQR Digital Ordering Platform</small>
        </div>
      </footer>

      {/* Floating Bottom Cart Bar for Mobile */}
      {cartCount > 0 && !cartOpen && !checkoutOpen && (
        <div className="floating-cart-bar">
          <div className="floating-cart-info">
            <span className="floating-qty">{cartCount} item{cartCount > 1 ? 's' : ''}</span>
            <span className="floating-divider">•</span>
            <span className="floating-total">₹{grandTotal}</span>
          </div>
          <button className="floating-cart-action" onClick={() => setCartOpen(true)}>
            View Cart 🛒 ➔
          </button>
        </div>
      )}

      {/* Cart Drawer Slide-out */}
      {cartOpen && (
        <div className="modal-backdrop" onClick={() => setCartOpen(false)}>
          <div className="cart-drawer" onClick={e => e.stopPropagation()}>
            <div className="drawer-header">
              <div className="drawer-title-box">
                <h2>Your Order</h2>
                <span className="drawer-table-badge">
                  {tableNumber ? `Table ${tableNumber}` : 'Table not set'}
                </span>
              </div>
              <button className="btn-close" onClick={() => setCartOpen(false)}>✕</button>
            </div>

            {cart.length === 0 ? (
              <div className="drawer-empty">
                <span className="empty-emoji">🛒</span>
                <h3>Your cart is empty</h3>
                <p>Add your favourite starters, main course curries or drinks from the menu.</p>
                <button className="btn-primary" onClick={() => setCartOpen(false)}>
                  Browse Menu
                </button>
              </div>
            ) : (
              <div className="drawer-body">
                {/* Item List */}
                <div className="cart-items-list">
                  {cart.map(ci => (
                    <div className="cart-item-row" key={ci.item.id}>
                      <div className="ci-left">
                        <span className={`food-symbol ${ci.item.type.toLowerCase()}`}></span>
                        <div className="ci-info">
                          <strong className="ci-name">{ci.item.name}</strong>
                          <span className="ci-unit-price">₹{ci.item.price} each</span>
                        </div>
                      </div>

                      <div className="ci-right">
                        <div className="card-qty-controller compact">
                          <button
                            className="qty-btn"
                            onClick={() => changeQuantity(ci.item.id, -1)}
                          >
                            −
                          </button>
                          <span className="qty-number">{ci.quantity}</span>
                          <button
                            className="qty-btn"
                            onClick={() => changeQuantity(ci.item.id, 1)}
                          >
                            +
                          </button>
                        </div>
                        <span className="ci-total">₹{ci.item.price * ci.quantity}</span>
                      </div>
                    </div>
                  ))}
                </div>

                {/* Cooking Instructions Input */}
                <div className="cooking-notes-box">
                  <label>Special Instructions for the Kitchen (Optional):</label>
                  <input
                    type="text"
                    placeholder="e.g. Less spicy, extra lemon, prepare without onion..."
                    value={specialInstructions}
                    onChange={e => setSpecialInstructions(e.target.value)}
                  />
                </div>

                {/* Bill Breakdown */}
                <div className="bill-summary">
                  <div className="bill-row">
                    <span>Items Subtotal</span>
                    <span>₹{subtotal}</span>
                  </div>
                  <div className="bill-row">
                    <span>Restaurant GST (5%)</span>
                    <span>₹{tax}</span>
                  </div>
                  <div className="bill-row grand-total">
                    <strong>Total Amount</strong>
                    <strong>₹{grandTotal}</strong>
                  </div>
                </div>

                {/* Checkout Trigger */}
                <button
                  className="btn-primary full-width"
                  onClick={() => {
                    setCartOpen(false)
                    setCheckoutOpen(true)
                  }}
                >
                  PROCEED TO ORDER (₹{grandTotal}) ➔
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Checkout Modal */}
      {checkoutOpen && (
        <div className="modal-backdrop" onClick={() => setCheckoutOpen(false)}>
          <form
            className="checkout-modal"
            onSubmit={handlePlaceOrder}
            onClick={e => e.stopPropagation()}
          >
            <div className="modal-header">
              <div>
                <h2>Confirm Table Order</h2>
                <small>Send directly to Star Planet Kitchen</small>
              </div>
              <button
                type="button"
                className="btn-close"
                onClick={() => setCheckoutOpen(false)}
              >
                ✕
              </button>
            </div>

            <div className="modal-body">
              <div className="form-group">
                <label>Table Number *</label>
                <input
                  required
                  type="text"
                  placeholder="e.g. 5, 12, or Bar-2"
                  value={tableNumber}
                  onChange={e => setTableNumber(e.target.value)}
                />
              </div>

              <div className="form-group">
                <label>Your Name *</label>
                <input
                  required
                  type="text"
                  placeholder="Enter your name"
                  value={customer.name}
                  onChange={e => setCustomer({ ...customer, name: e.target.value })}
                />
              </div>

              <div className="form-group">
                <label>Mobile Number (For Order Updates) *</label>
                <input
                  required
                  type="tel"
                  pattern="[6-9][0-9]{9}"
                  maxLength="10"
                  placeholder="10-digit mobile number"
                  value={customer.phone}
                  onChange={e => setCustomer({ ...customer, phone: e.target.value })}
                />
              </div>

              <div className="form-group">
                <label>Payment Preference</label>
                <div className="payment-options">
                  <label className={`payment-pill ${customer.paymentMethod === 'UPI' ? 'selected' : ''}`}>
                    <input
                      type="radio"
                      name="payment"
                      value="UPI"
                      checked={customer.paymentMethod === 'UPI'}
                      onChange={() => setCustomer({ ...customer, paymentMethod: 'UPI' })}
                    />
                    <span>📲 Pay via UPI / QR on Table</span>
                  </label>
                  <label className={`payment-pill ${customer.paymentMethod === 'Counter' ? 'selected' : ''}`}>
                    <input
                      type="radio"
                      name="payment"
                      value="Counter"
                      checked={customer.paymentMethod === 'Counter'}
                      onChange={() => setCustomer({ ...customer, paymentMethod: 'Counter' })}
                    />
                    <span>💵 Pay Cash / Card at Counter</span>
                  </label>
                </div>
              </div>

              <div className="order-final-bill">
                <div className="of-row">
                  <span>Total Items:</span>
                  <b>{cartCount}</b>
                </div>
                <div className="of-row">
                  <span>Grand Total:</span>
                  <b className="total-gold">₹{grandTotal}</b>
                </div>
              </div>

              <button type="submit" className="btn-primary full-width">
                PLACE ORDER NOW
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Set Table Number Modal */}
      {tableModalOpen && (
        <div className="modal-backdrop" onClick={() => setTableModalOpen(false)}>
          <form
            className="dialog-modal"
            onSubmit={handleSaveTable}
            onClick={e => e.stopPropagation()}
          >
            <div className="modal-header">
              <h3>Enter Table Number</h3>
              <button
                type="button"
                className="btn-close"
                onClick={() => setTableModalOpen(false)}
              >
                ✕
              </button>
            </div>
            <div className="modal-body">
              <p className="dialog-desc">
                Please enter the table number displayed on your table QR stand so your order reaches you accurately.
              </p>
              <div className="form-group">
                <input
                  autoFocus
                  required
                  type="text"
                  placeholder="e.g. 7 or AC-4"
                  value={tempTableInput}
                  onChange={e => setTempTableInput(e.target.value)}
                />
              </div>
              <button type="submit" className="btn-primary full-width">
                Confirm Table
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Call Waiter / Service Modal */}
      {serviceModalOpen && (
        <div className="modal-backdrop" onClick={() => setServiceModalOpen(false)}>
          <div className="dialog-modal" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h3>🔔 Request Service</h3>
              <button className="btn-close" onClick={() => setServiceModalOpen(false)}>✕</button>
            </div>
            <div className="modal-body">
              <p className="dialog-desc">
                Need something at {tableNumber ? `Table ${tableNumber}` : 'your table'}? Tap below and our captain will attend immediately.
              </p>
              <div className="service-options-grid">
                <button
                  className="service-btn"
                  onClick={() => handleCallWaiter('Captain assistance')}
                >
                  <span>🙋‍♂️</span> Call Waiter / Captain
                </button>
                <button
                  className="service-btn"
                  onClick={() => handleCallWaiter('Drinking water refill')}
                >
                  <span>💧</span> Request Drinking Water
                </button>
                <button
                  className="service-btn"
                  onClick={() => handleCallWaiter('Extra cutlery / plates')}
                >
                  <span>🍴</span> Cutlery & Plates
                </button>
                <button
                  className="service-btn"
                  onClick={() => handleCallWaiter('Bill presentation')}
                >
                  <span>🧾</span> Request Final Bill
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Placed Order Success Modal */}
      {placedOrder && (
        <div className="modal-backdrop">
          <div className="receipt-modal">
            <div className="receipt-check">✓</div>
            <h2>Order Placed Successfully!</h2>
            <p className="receipt-subtitle">Your order has been transmitted to Star Planet Kitchen.</p>

            <div className="receipt-card">
              <div className="receipt-row">
                <span>Order Reference:</span>
                <b>#{placedOrder.orderId}</b>
              </div>
              <div className="receipt-row">
                <span>Table:</span>
                <b className="table-highlight">Table {placedOrder.table}</b>
              </div>
              <div className="receipt-row">
                <span>Placed At:</span>
                <span>{placedOrder.time}, {placedOrder.date}</span>
              </div>
              <div className="receipt-row">
                <span>Customer:</span>
                <span>{placedOrder.customerName} ({placedOrder.customerPhone})</span>
              </div>
              <div className="receipt-row">
                <span>Payment Mode:</span>
                <span>{placedOrder.paymentMethod === 'UPI' ? 'UPI / QR at Table' : 'Cash at Counter'}</span>
              </div>

              {placedOrder.instructions && (
                <div className="receipt-instructions">
                  <small>Kitchen Note: "{placedOrder.instructions}"</small>
                </div>
              )}

              <hr className="receipt-divider" />

              <div className="receipt-items-list">
                {placedOrder.items.map(ci => (
                  <div className="receipt-item" key={ci.item.id}>
                    <span>{ci.quantity} × {ci.item.name}</span>
                    <span>₹{ci.item.price * ci.quantity}</span>
                  </div>
                ))}
              </div>

              <hr className="receipt-divider" />

              <div className="receipt-row grand">
                <strong>Grand Total (incl. GST):</strong>
                <strong>₹{placedOrder.total}</strong>
              </div>
            </div>

            <div className="kitchen-progress">
              <div className="step active">
                <span className="dot"></span>
                <small>Received</small>
              </div>
              <div className="progress-line active"></div>
              <div className="step active">
                <span className="dot"></span>
                <small>Kitchen Preparing</small>
              </div>
              <div className="progress-line"></div>
              <div className="step">
                <span className="dot"></span>
                <small>Serve to Table</small>
              </div>
            </div>

            <div className="receipt-actions">
              <button
                className="btn-primary full-width"
                onClick={() => setPlacedOrder(null)}
              >
                + ORDER MORE DISHES
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
