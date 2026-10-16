import './style.css';

// Placeholder until this game is built. See README.md for the design.
const app = document.querySelector<HTMLDivElement>('#app')!;
app.innerHTML = `
  <main>
    <div class="icon">🗡️</div>
    <h1>Grid Crawler</h1>
    <p>Classic turn-based roguelike. One step, one turn. Every monster moves when you move.</p>
    <p class="soon">Coming soon</p>
  </main>
`;
