
import './App.css'

function App() {
  return (
    <div className="app">
      <header className="navbar">
        <div className="logo">Cafe<span>Desk</span></div>
        <nav>
          <a href="#home">Home</a>
          <a href="#menu">Our Menu</a>
          <a href="#about">About</a>
        </nav>
        <button className="table-btn">Choose a Table</button>
      </header>

      <main id="home">
        <section className="hero">
          <div className="hero-content">
            <p className="eyebrow">YOUR NEIGHBOURHOOD CAFE</p>
            <h1>Your daily cup<br />of <em>something lovely.</em></h1>
            <p className="description">
              Thoughtfully brewed coffee, good things to eat,
              and a seat that feels like yours.
            </p>
            <a className="menu-btn" href="#menu">Explore Our Menu ↗</a>
          </div>
        </section>

        <section id="menu" className="menu-section">
          <p className="eyebrow">MADE WITH LOVE</p>
          <h2>Something for every mood.</h2>
          <p>Our delicious menu is coming soon.</p>
        </section>

        <section id="about" className="about-section">
          <h2>A little moment, made better.</h2>
          <p>Welcome to CafeDesk. Your neighbourhood cafe.</p>
        </section>
      </main>

      <footer>
        © 2026 CafeDesk. Made with love.
      </footer>
    </div>
  )
}

export default App
