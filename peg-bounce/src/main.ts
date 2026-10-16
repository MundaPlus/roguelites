import './style.css';

// Placeholder until this game is built. See README.md for the design.
const app = document.querySelector<HTMLDivElement>('#app')!;
app.innerHTML = `
  <main>
    <div class="icon">🔮</div>
    <h1>Peg Bounce</h1>
    <p>Physics pachinko combat. Aim, drop, bounce. Every peg you hit adds damage.</p>
    <p class="soon">Coming soon</p>
  </main>
`;
