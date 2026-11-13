import { useState, useMemo, useEffect, useRef } from 'react'
import { categories, categoryMeta, menuItems } from './data/menuData'
import { createOrder, createServiceRequest, isSupabaseConfigured, supabase } from './lib/supabase'
import StarPortalButton from './components/StarPortalButton'
import PerspectiveCinematic from './components/PerspectiveCinematic'
import './App.css'

function getCategoryId(category) {
  return `cat-${category.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`
}

export default function App() {
  // Table detection from URL ?table=...
  const urlTable = new URLSearchParams(window.location.search).get('table') || ''
  const [tableNumber, setTableNumber] = useState(urlTable)
  const [showLanding, setShowLanding] = useState(true)
  const [tableModalOpen, setTableModalOpen] = useState(false)
  const [tempTableInput, setTempTableInput] = useState('')
  const [visibleCategories, setVisibleCategories] = useState(categories)
  const [visibleCategoryMeta, setVisibleCategoryMeta] = useState(categoryMeta)
  const [visibleMenuItems, setVisibleMenuItems] = useState(menuItems)

  // Menu filters & search
  const [activeCategory, setActiveCategory] = useState('Soups & Salads')
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
    paymentMethod: 'UPI',
  })

  // Order state
  const [placedOrder, setPlacedOrder] = useState(null)
  const [orderSubmitting, setOrderSubmitting] = useState(false)
  const [orderError, setOrderError] = useState('')
  const orderSubmittingRef = useRef(false)

  // Service / Waiter Call state
  const [serviceModalOpen, setServiceModalOpen] = useState(false)
  const [toastMessage, setToastMessage] = useState('')

  function showToast(msg) {
    setToastMessage(msg)
    setTimeout(() => setToastMessage(''), 2600)
  }

  useEffect(() => {
    if (!isSupabaseConfigured || !supabase) return undefined

    let active = true
    async function loadPublishedMenu() {
      const { data: settings, error: settingsError } = await supabase
        .from('menu_settings').select('is_published').eq('singleton', true).maybeSingle()
      if (settingsError) throw settingsError
      if (!settings?.is_published) return

      const [categoryResult, itemResult] = await Promise.all([
        supabase.from('menu_categories').select('id,name,icon,description,display_order').order('display_order'),
        supabase.from('menu_items').select('id,legacy_id,name,category_id,price,description,type,image,is_available,is_popular,is_chef_special,display_order').eq('is_available', true).order('display_order'),
      ])
      if (categoryResult.error) throw categoryResult.error
      if (itemResult.error) throw itemResult.error
      if (!itemResult.data?.length) return

      const categoryById = new Map(categoryResult.data.map(category => [category.id, category]))
      const nextCategories = ['All', ...categoryResult.data.map(category => category.name)]
      const nextCategoryMeta = Object.fromEntries(categoryResult.data.map(category => [category.name, {
        icon: category.icon || '🍽️',
        desc: category.description || '',
      }]))
      const nextItems = itemResult.data.flatMap(item => {
        const category = categoryById.get(item.category_id)
        if (!category) return []
        return [{
          id: item.legacy_id ?? item.id,
          name: item.name,
          category: category.name,
          price: Number(item.price),
          description: item.description || '',
          type: item.type || 'Veg',
          image: item.image || '',
          isPopular: Boolean(item.is_popular),
          isChefSpecial: Boolean(item.is_chef_special),
        }]
      })

      if (active) {
        setVisibleCategories(nextCategories)
        setVisibleCategoryMeta(nextCategoryMeta)
        setVisibleMenuItems(nextItems)
        setActiveCategory(nextCategories[1] || 'All')
      }
    }

    loadPublishedMenu().catch(error => {
      console.warn('Database menu unavailable; keeping the built-in customer menu.', error)
    })
    return () => { active = false }
  }, [])

  // Filter menu items dynamically
  const filteredMenu = useMemo(() => {
    return visibleMenuItems.filter(item => {
      const matchDiet = dietFilter === 'All' || item.type === dietFilter
      const query = search.trim().toLowerCase()
      const matchSearch =
        !query ||
        item.name.toLowerCase().includes(query) ||
        item.category.toLowerCase().includes(query) ||
        (item.description && item.description.toLowerCase().includes(query))
      return matchDiet && matchSearch
    })
  }, [visibleMenuItems, dietFilter, search])

  const groupedMenu = useMemo(
    () =>
      visibleCategories
        .slice(1)
        .map(category => ({
          category,
          items: filteredMenu.filter(item => item.category === category),
        }))
        .filter(section => section.items.length > 0),
    [visibleCategories, filteredMenu],
  )
  const featuredItems = useMemo(
    () => visibleMenuItems.filter(item => item.isChefSpecial).slice(0, 4),
    [visibleMenuItems],
  )
  const visibleCategoryCounts = useMemo(
    () => Object.fromEntries(visibleCategories.slice(1).map(category => [
      category,
      visibleMenuItems.filter(item => item.category === category).length,
    ])),
    [visibleCategories, visibleMenuItems],
  )

  function openMenu() {
    setShowLanding(false)
    window.scrollTo({ top: 0, behavior: 'auto' })
  }

  // Auto-highlight active category on scroll
  useEffect(() => {
    const sections = document.querySelectorAll('[data-menu-category]')
    if (!sections.length || !('IntersectionObserver' in window)) return undefined

    const observer = new IntersectionObserver(
      entries => {
        const visible = entries
          .filter(e => e.isIntersecting)
          .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top)
        if (visible[0]) {
          setActiveCategory(visible[0].target.dataset.menuCategory)
        }
      },
      { rootMargin: '-15% 0px -70% 0px' },
    )

    sections.forEach(s => observer.observe(s))
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
          ci.item.id === item.id ? { ...ci, quantity: ci.quantity + 1 } : ci,
        )
      }
      return [...curr, { item, quantity: 1 }]
    })
    showToast(`Added ${item.name}`)
  }

  function changeQuantity(itemId, amount) {
    setCart(curr =>
      curr
        .map(ci => (ci.item.id === itemId ? { ...ci, quantity: ci.quantity + amount } : ci))
        .filter(ci => ci.quantity > 0),
    )
  }

  function handleSaveTable(e) {
    e.preventDefault()
    if (tempTableInput.trim()) {
      setTableNumber(tempTableInput.trim())
      setTableModalOpen(false)
      showToast(`Set to Table ${tempTableInput.trim()}`)
    }
  }

  async function handlePlaceOrder(e) {
    e.preventDefault()
    if (orderSubmittingRef.current) return

    if (!tableNumber) {
      setCheckoutOpen(false)
      setTempTableInput('')
      setTableModalOpen(true)
      showToast('Please enter your table number')
      return
    }

    orderSubmittingRef.current = true
    setOrderSubmitting(true)
    setOrderError('')

    const orderData = {
      orderId: 'SP' + Math.floor(100000 + Math.random() * 900000),
      table: tableNumber.trim(),
      customerName: customer.name.trim(),
      customerPhone: customer.phone.trim(),
      paymentMethod: customer.paymentMethod,
      items: [...cart],
      instructions: specialInstructions,
      subtotal,
      tax,
      total: grandTotal,
      time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      date: new Date().toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }),
    }

    try {
      const result = await createOrder(orderData)
      if (!result.success) {
        setOrderError(result.message || 'We could not save your order. Please try again.')
        return
      }

      setPlacedOrder(orderData)
      setCart([])
      setSpecialInstructions('')
      setCheckoutOpen(false)
      setCartOpen(false)
    } catch (error) {
      console.error('Order submission failed:', error)
      setOrderError('We could not save your order. Please check your connection and try again.')
    } finally {
      orderSubmittingRef.current = false
      setOrderSubmitting(false)
    }
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
    <div className="app-container">
      {/* Brief Floating Toast */}
      {toastMessage && (
        <div className="toast-pill">
          <span>{toastMessage}</span>
        </div>
      )}

      {/* Clean, Professional Sticky Header */}
      <header className="header-bar">
        <div className="header-left">
          {/* Table Selector */}
          <button
            className={`table-badge-btn ${tableNumber ? 'has-table' : ''}`}
            onClick={() => {
              setTempTableInput(tableNumber)
              setTableModalOpen(true)
            }}
            title="Set table number"
          >
            <span className="table-icon">🪑</span>
            <span className="table-txt">{tableNumber ? `Table ${tableNumber}` : 'Set Table #'}</span>
          </button>
        </div>

        <div className="header-actions">
          {/* Call Waiter */}
          <button
            className="action-icon-btn waiter-btn"
            onClick={() => setServiceModalOpen(true)}
            title="Call Captain / Service"
          >
            🔔 <span className="btn-label">Waiter</span>
          </button>

          {/* Toggle Showcase / Menu */}
          <button
            className={`action-icon-btn ${showLanding ? 'active-gold' : ''}`}
            onClick={() => setShowLanding(!showLanding)}
            title={showLanding ? 'Go to full menu' : 'Open 3D perspective showcase'}
          >
            {showLanding ? '📋 Menu' : '✨ 3D View'}
          </button>

          {/* Cart Icon */}
          <button
            className="action-icon-btn cart-btn"
            onClick={() => setCartOpen(true)}
            title="View Cart"
          >
            🛒 <span className="btn-label">Cart</span>
            {cartCount > 0 && <span className="cart-badge-count">{cartCount}</span>}
          </button>
        </div>
      </header>

      {showLanding && (
        <>
          <PerspectiveCinematic
            onEnterMenu={openMenu}
            tableNumber={tableNumber}
            onOpenTableModal={() => {
              setTempTableInput(tableNumber)
              setTableModalOpen(true)
            }}
          />

          <main className="landing-page">

          <button
            className="table-entry-pill"
            onClick={() => {
              setTempTableInput(tableNumber)
              setTableModalOpen(true)
            }}
          >
            <span className="table-entry-icon">⌑</span>
            <span><strong>Seated at a table?</strong><small>Enter your table number to order instantly.</small></span>
            <span className="table-entry-arrow" aria-hidden="true">→</span>
          </button>

          <section className="signature-section">
            <div className="section-heading">
              <div>
                <span className="eyebrow">FROM OUR KITCHEN, WITH LOVE</span>
                <h2>Signature <em>flavors</em></h2>
              </div>
              <button className="text-link" onClick={openMenu}>View full menu <span aria-hidden="true">↗</span></button>
            </div>
            <div className="signature-grid">
              {featuredItems.map((item, index) => (
                <article className={`signature-card signature-card-${index + 1}`} key={item.id}>
                  <div className="signature-art" aria-hidden="true">
                    <span>{['🍗', '🍢', '🍖', '🍛'][index % 4]}</span>
                    <i className="signature-spark">✦</i>
                    <i className="signature-spark signature-spark-two">✦</i>
                  </div>
                  <div className="signature-info">
                    <div className="signature-name-line">
                      <span className={`fssai-dot ${item.type === 'Veg' ? 'veg' : item.type === 'Egg' ? 'egg' : 'nonveg'}`} title={item.type} />
                      <h3>{item.name}</h3>
                    </div>
                    <div className="signature-bottom">
                      <strong>₹{item.price}</strong>
                      <StarPortalButton
                        className="signature-add-btn"
                        size="compact"
                        endIcon="+"
                        aria-label={`Add ${item.name} to order`}
                        onClick={() => addToCart(item)}
                      >Add</StarPortalButton>
                    </div>
                  </div>
                </article>
              ))}
            </div>
          </section>

          <section className="dining-perks" aria-label="Dining perks">
            <div><span>↯</span><p>Direct-to-kitchen<br /><strong>ordering</strong></p></div>
            <div><span>♨</span><p><strong>380+ fresh</strong><br />dishes to discover</p></div>
            <div><span>◉</span><p>Full family<br /><strong>bar</strong></p></div>
          </section>

          <section className="menu-banner">
            <div className="menu-banner-copy">
              <span className="eyebrow">YOUR TABLE IS WAITING</span>
              <h2>Something delicious<br />is just a tap away.</h2>
              <p>Browse the complete menu and send your favourites straight to our kitchen.</p>
            </div>
            <StarPortalButton
              className="menu-banner-cta"
              size="regular"
              onClick={openMenu}
              endIcon="➜"
            >
              View full digital menu &amp; order now
            </StarPortalButton>
            <span className="banner-spark banner-spark-one" aria-hidden="true">✦</span>
            <span className="banner-spark banner-spark-two" aria-hidden="true">✧</span>
          </section>
        </main>
      </>)}

      {/* Search & Dietary Preference Filter (Fast, uncluttered) */}
      {!showLanding && <>
      <div className="filters-toolbar">
        <div className="search-wrapper">
          <span className="search-glass">🔍</span>
          <input
            type="search"
            className="search-input"
            placeholder="Search 380+ dishes (Biryani, Tandoori, Paneer, Soup)..."
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
          {search && (
            <button className="search-clear-btn" onClick={() => setSearch('')}>
              ✕
            </button>
          )}
        </div>

        {/* Diet quick switch */}
        <div className="diet-switch-row">
          <button
            className={`diet-tab ${dietFilter === 'All' ? 'active' : ''}`}
            onClick={() => setDietFilter('All')}
          >
            All
          </button>
          <button
            className={`diet-tab veg ${dietFilter === 'Veg' ? 'active' : ''}`}
            onClick={() => setDietFilter('Veg')}
          >
            <span className="fssai-dot veg"></span> Veg
          </button>
          <button
            className={`diet-tab nonveg ${dietFilter === 'Non-Veg' ? 'active' : ''}`}
            onClick={() => setDietFilter('Non-Veg')}
          >
            <span className="fssai-dot nonveg"></span> Non-Veg
          </button>
          <button
            className={`diet-tab egg ${dietFilter === 'Egg' ? 'active' : ''}`}
            onClick={() => setDietFilter('Egg')}
          >
            <span className="fssai-dot egg"></span> Egg
          </button>
        </div>
      </div>

      {/* Sticky Categories Navigation Bar */}
      <nav className="category-nav-bar" aria-label="Menu categories">
        <div className="category-nav-scroll">
          {visibleCategories.slice(1).map(cat => {
            const meta = visibleCategoryMeta[cat] || { icon: '🍽️' }
            const isSelected = activeCategory === cat

            return (
              <button
                key={cat}
                className={`category-pill ${isSelected ? 'active' : ''}`}
                onClick={() => {
                  setActiveCategory(cat)
                  const target = document.getElementById(getCategoryId(cat))
                  if (target) {
                    target.scrollIntoView({ behavior: 'smooth', block: 'start' })
                  }
                }}
              >
                <span className="pill-icon">{meta.icon}</span>
                <span className="pill-text">{cat}</span>
                <span className="pill-count">{visibleCategoryCounts[cat]}</span>
              </button>
            )
          })}
        </div>
      </nav>

      {/* Main Menu Body */}
      <main className="menu-content">
        {groupedMenu.map(({ category, items }) => (
          <section
            key={category}
            id={getCategoryId(category)}
            data-menu-category={category}
            className="category-group"
          >
            <div className="category-group-header">
              <div className="cgh-left">
                <span className="cgh-icon">{visibleCategoryMeta[category]?.icon || '🍽️'}</span>
                <h2>{category}</h2>
              </div>
              <span className="cgh-count">{items.length} items</span>
            </div>

            <div className="dishes-list">
              {items.map(item => {
                const qty = getQuantity(item.id)
                const isVeg = item.type === 'Veg'
                const isEgg = item.type === 'Egg'
                const typeClass = isVeg ? 'veg' : isEgg ? 'egg' : 'nonveg'

                return (
                  <article key={item.id} className="dish-row">
                    {/* Left: Details */}
                    <div className="dish-info">
                      <div className="dish-header-line">
                        <span className={`fssai-dot ${typeClass}`} title={item.type}></span>
                        {item.isChefSpecial && <span className="mini-tag special">★ Chef Special</span>}
                        {item.isPopular && !item.isChefSpecial && <span className="mini-tag popular">🔥 Popular</span>}
                      </div>

                      <h3 className="dish-title">{item.name}</h3>

                      <div className="dish-price">
                        <span className="price-curr">₹</span>
                        <span className="price-val">{item.price}</span>
                      </div>

                      {item.description && <p className="dish-desc">{item.description}</p>}
                    </div>

                    {/* Right: Media & Add Controller */}
                    <div className="dish-action-col">
                      {item.image ? (
                        <div className="dish-thumb-wrap">
                          <img
                            src={item.image}
                            alt={item.name}
                            className="dish-thumb-img"
                            loading="lazy"
                            onError={e => {
                              // If image fails, cleanly hide it without broken box
                              e.currentTarget.style.display = 'none'
                            }}
                          />
                          <div className="dish-thumb-btn-overlay">
                            {qty === 0 ? (
                              <button
                                className="add-btn-primary"
                                onClick={() => addToCart(item)}
                              >
                                ADD +
                              </button>
                            ) : (
                              <div className="qty-stepper compact">
                                <button onClick={() => changeQuantity(item.id, -1)}>−</button>
                                <span>{qty}</span>
                                <button onClick={() => changeQuantity(item.id, 1)}>+</button>
                              </div>
                            )}
                          </div>
                        </div>
                      ) : (
                        <div className="dish-no-thumb">
                          {qty === 0 ? (
                            <button
                              className="add-btn-primary"
                              onClick={() => addToCart(item)}
                            >
                              ADD +
                            </button>
                          ) : (
                            <div className="qty-stepper">
                              <button onClick={() => changeQuantity(item.id, -1)}>−</button>
                              <span>{qty}</span>
                              <button onClick={() => changeQuantity(item.id, 1)}>+</button>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  </article>
                )
              })}
            </div>
          </section>
        ))}

        {/* Empty State */}
        {filteredMenu.length === 0 && (
          <div className="empty-state-box">
            <span className="empty-state-icon">🍽️</span>
            <h3>No dishes found</h3>
            <p>No items matched "{search}". Try searching for another dish or reset filters.</p>
            <button
              className="reset-filters-btn"
              onClick={() => {
                setSearch('')
                setDietFilter('All')
              }}
            >
              Reset Filters
            </button>
          </div>
        )}
      </main>
      </>}

      {/* Minimal, Professional Restaurant Info Footer */}
      <footer className={`simple-footer ${showLanding ? 'landing-footer' : ''}`}>
        <div className="footer-content">
          <div className="footer-left">
            <strong>Star Planet Family Restaurant & Bar</strong>
            <p>Y K Nagar, Virar West <span>•</span> Open daily 11:00 AM – 01:30 AM</p>
          </div>
          <a
            href="https://maps.app.goo.gl/Ao1u12QoU8rcesXk6"
            target="_blank"
            rel="noreferrer"
            className="footer-map-link"
          >
            Directions ↗
          </a>
        </div>
      </footer>

      {/* Floating Bottom Cart Bar (Appears when items in cart) */}
      {cartCount > 0 && !cartOpen && !checkoutOpen && (
        <aside className="bottom-cart-bar" aria-label="Cart summary">
          <div className="bcb-details">
            <span className="bcb-count">
              {cartCount} {cartCount === 1 ? 'item' : 'items'}
            </span>
            <span className="bcb-sep">•</span>
            <span className="bcb-price">₹{grandTotal}</span>
          </div>
          <button className="bcb-btn" onClick={() => setCartOpen(true)}>
            View Cart ➔
          </button>
        </aside>
      )}

      {/* Cart Drawer */}
      {cartOpen && (
        <div className="overlay-backdrop" onClick={() => setCartOpen(false)}>
          <div className="cart-drawer-sheet" onClick={e => e.stopPropagation()}>
            <div className="drawer-header">
              <div>
                <h2>Your Order</h2>
                <span className="drawer-sub">
                  {tableNumber ? `Table ${tableNumber}` : 'Table not assigned'}
                </span>
              </div>
              <button className="drawer-close-btn" onClick={() => setCartOpen(false)}>
                ✕
              </button>
            </div>

            {cart.length === 0 ? (
              <div className="drawer-empty-body">
                <span className="empty-cart-icon">🛒</span>
                <h3>Your cart is empty</h3>
                <p>Select your favorite starters, main courses or beverages from the menu.</p>
                <button className="primary-pill-btn" onClick={() => setCartOpen(false)}>
                  Browse Menu
                </button>
              </div>
            ) : (
              <div className="drawer-scroll-body">
                <div className="cart-items-box">
                  {cart.map(ci => {
                    const isVeg = ci.item.type === 'Veg'
                    const isEgg = ci.item.type === 'Egg'
                    const typeClass = isVeg ? 'veg' : isEgg ? 'egg' : 'nonveg'

                    return (
                      <div key={ci.item.id} className="cart-item-row">
                        <div className="cir-info">
                          <span className={`fssai-dot ${typeClass}`}></span>
                          <div>
                            <strong className="cir-name">{ci.item.name}</strong>
                            <span className="cir-unit-price">₹{ci.item.price}</span>
                          </div>
                        </div>

                        <div className="cir-actions">
                          <div className="qty-stepper compact">
                            <button onClick={() => changeQuantity(ci.item.id, -1)}>−</button>
                            <span>{ci.quantity}</span>
                            <button onClick={() => changeQuantity(ci.item.id, 1)}>+</button>
                          </div>
                          <span className="cir-total">₹{ci.item.price * ci.quantity}</span>
                        </div>
                      </div>
                    )
                  })}
                </div>

                {/* Kitchen Special Note */}
                <div className="kitchen-note-box">
                  <label htmlFor="kitchen-notes">Cooking instructions (Optional):</label>
                  <input
                    id="kitchen-notes"
                    type="text"
                    placeholder="e.g. Less spicy, extra lemon, without onion..."
                    value={specialInstructions}
                    onChange={e => setSpecialInstructions(e.target.value)}
                  />
                </div>

                {/* Bill Breakdown */}
                <div className="bill-card">
                  <div className="bill-line">
                    <span>Item Subtotal</span>
                    <span>₹{subtotal}</span>
                  </div>
                  <div className="bill-line">
                    <span>GST (5%)</span>
                    <span>₹{tax}</span>
                  </div>
                  <div className="bill-line grand">
                    <strong>Total Amount</strong>
                    <strong>₹{grandTotal}</strong>
                  </div>
                </div>

                <button
                  className="primary-checkout-btn"
                  onClick={() => {
                    setCartOpen(false)
                    setCheckoutOpen(true)
                  }}
                >
                  Confirm & Place Order (₹{grandTotal}) ➔
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Checkout Modal */}
      {checkoutOpen && (
        <div className="overlay-backdrop" onClick={() => setCheckoutOpen(false)}>
          <form
            className="clean-modal-card"
            onSubmit={handlePlaceOrder}
            onClick={e => e.stopPropagation()}
          >
            <div className="modal-title-row">
              <div>
                <h2>Confirm Table Order</h2>
                <small>Sends directly to Star Planet Kitchen</small>
              </div>
              <button
                type="button"
                className="drawer-close-btn"
                onClick={() => setCheckoutOpen(false)}
              >
                ✕
              </button>
            </div>

            <div className="modal-form-content">
              <div className="input-field-group">
                <label>Table Number *</label>
                <input
                  required
                  type="text"
                  placeholder="e.g. 5, 12, or Bar-2"
                  value={tableNumber}
                  onChange={e => setTableNumber(e.target.value)}
                />
              </div>

              <div className="input-field-group">
                <label>Your Name *</label>
                <input
                  required
                  type="text"
                  placeholder="Enter your name"
                  value={customer.name}
                  onChange={e => setCustomer({ ...customer, name: e.target.value })}
                />
              </div>

              <div className="input-field-group">
                <label>Mobile Number (For order updates) *</label>
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

              <div className="input-field-group">
                <label>Payment Mode</label>
                <div className="payment-radio-group">
                  <label className={`pay-chip ${customer.paymentMethod === 'UPI' ? 'selected' : ''}`}>
                    <input
                      type="radio"
                      name="payment"
                      value="UPI"
                      checked={customer.paymentMethod === 'UPI'}
                      onChange={() => setCustomer({ ...customer, paymentMethod: 'UPI' })}
                    />
                    <span>📲 UPI / Online at Table</span>
                  </label>
                  <label className={`pay-chip ${customer.paymentMethod === 'Counter' ? 'selected' : ''}`}>
                    <input
                      type="radio"
                      name="payment"
                      value="Counter"
                      checked={customer.paymentMethod === 'Counter'}
                      onChange={() => setCustomer({ ...customer, paymentMethod: 'Counter' })}
                    />
                    <span>💵 Cash / Card at Counter</span>
                  </label>
                </div>
              </div>

              <div className="modal-bill-summary">
                <span>Total Payable ({cartCount} items):</span>
                <b>₹{grandTotal}</b>
              </div>

              {orderError && <p className="order-error-message" role="alert">{orderError}</p>}
              <button type="submit" className="primary-checkout-btn" disabled={orderSubmitting}>
                {orderSubmitting ? 'Sending order…' : 'Send Order to Kitchen ➔'}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Set Table Modal */}
      {tableModalOpen && (
        <div className="overlay-backdrop" onClick={() => setTableModalOpen(false)}>
          <form
            className="clean-modal-card small"
            onSubmit={handleSaveTable}
            onClick={e => e.stopPropagation()}
          >
            <div className="modal-title-row">
              <h3>Enter Table Number</h3>
              <button
                type="button"
                className="drawer-close-btn"
                onClick={() => setTableModalOpen(false)}
              >
                ✕
              </button>
            </div>
            <div className="modal-form-content">
              <p className="modal-help-txt">
                Check the number displayed on your table stand (e.g. 7, 14, AC-2).
              </p>
              <div className="input-field-group">
                <input
                  autoFocus
                  required
                  type="text"
                  placeholder="Enter table number"
                  value={tempTableInput}
                  onChange={e => setTempTableInput(e.target.value)}
                />
              </div>
              <button type="submit" className="primary-checkout-btn">
                Confirm Table
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Call Waiter Modal */}
      {serviceModalOpen && (
        <div className="overlay-backdrop" onClick={() => setServiceModalOpen(false)}>
          <div className="clean-modal-card small" onClick={e => e.stopPropagation()}>
            <div className="modal-title-row">
              <h3>🔔 Request Service</h3>
              <button className="drawer-close-btn" onClick={() => setServiceModalOpen(false)}>
                ✕
              </button>
            </div>
            <div className="modal-form-content">
              <p className="modal-help-txt">
                Need service at {tableNumber ? `Table ${tableNumber}` : 'your table'}? Tap below:
              </p>
              <div className="waiter-service-grid">
                <button
                  className="service-option-btn"
                  onClick={() => handleCallWaiter('Captain assistance')}
                >
                  <span>🙋‍♂️</span>
                  <span>Call Waiter</span>
                </button>
                <button
                  className="service-option-btn"
                  onClick={() => handleCallWaiter('Drinking water refill')}
                >
                  <span>💧</span>
                  <span>Drinking Water</span>
                </button>
                <button
                  className="service-option-btn"
                  onClick={() => handleCallWaiter('Extra cutlery / plates')}
                >
                  <span>🍴</span>
                  <span>Cutlery & Plates</span>
                </button>
                <button
                  className="service-option-btn"
                  onClick={() => handleCallWaiter('Bill presentation')}
                >
                  <span>🧾</span>
                  <span>Get Bill</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Order Placed Receipt Modal */}
      {placedOrder && (
        <div className="overlay-backdrop">
          <div className="clean-modal-card receipt" onClick={e => e.stopPropagation()}>
            <div className="receipt-success-badge">✓</div>
            <h2>Order Placed!</h2>
            <p className="receipt-subhead">Transmitted directly to Star Planet Kitchen.</p>

            <div className="receipt-details-box">
              <div className="r-line">
                <span>Order ID:</span>
                <b>#{placedOrder.orderId}</b>
              </div>
              <div className="r-line">
                <span>Table:</span>
                <b className="r-table-tag">Table {placedOrder.table}</b>
              </div>
              <div className="r-line">
                <span>Time:</span>
                <span>{placedOrder.time}</span>
              </div>
              <div className="r-line">
                <span>Customer:</span>
                <span>{placedOrder.customerName}</span>
              </div>

              {placedOrder.instructions && (
                <div className="r-note">
                  <small>Kitchen note: "{placedOrder.instructions}"</small>
                </div>
              )}

              <div className="r-items-list">
                {placedOrder.items.map(ci => (
                  <div key={ci.item.id} className="r-item-row">
                    <span>{ci.quantity} × {ci.item.name}</span>
                    <span>₹{ci.item.price * ci.quantity}</span>
                  </div>
                ))}
              </div>

              <div className="r-line r-grand">
                <strong>Grand Total (incl. GST):</strong>
                <strong>₹{placedOrder.total}</strong>
              </div>
            </div>

            <div className="status-progress-track">
              <div className="track-step done">
                <span className="step-dot"></span>
                <small>Received</small>
              </div>
              <div className="track-connector active"></div>
              <div className="track-step active">
                <span className="step-dot"></span>
                <small>Preparing</small>
              </div>
              <div className="track-connector"></div>
              <div className="track-step">
                <span className="step-dot"></span>
                <small>Served</small>
              </div>
            </div>

            <button
              className="primary-checkout-btn"
              onClick={() => setPlacedOrder(null)}
            >
              + Order More Items
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
