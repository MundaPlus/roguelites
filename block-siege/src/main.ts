import './style.css';

// Placeholder until this game is built. See README.md for the design.
const app = document.querySelector<HTMLDivElement>('#app')!;
app.innerHTML = `
  <main>
    <div class="icon">🧱</div>
    <h1>Block Siege</h1>
    <p>Falling-block combat. Stack pieces. Every cleared line attacks the enemy.</p>
    <p class="soon">Coming soon</p>
  </main>
`;
