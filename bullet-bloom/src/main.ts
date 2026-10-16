import './style.css';

// Placeholder until this game is built. See README.md for the design.
const app = document.querySelector<HTMLDivElement>('#app')!;
app.innerHTML = `
  <main>
    <div class="icon">🌸</div>
    <h1>Bullet Bloom</h1>
    <p>Vertical bullet-hell shooter. Thread the bullet patterns. Graze to charge the bomb.</p>
    <p class="soon">Coming soon</p>
  </main>
`;
