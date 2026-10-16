import './style.css';

// Placeholder until this game is built. See README.md for the design.
const app = document.querySelector<HTMLDivElement>('#app')!;
app.innerHTML = `
  <main>
    <div class="icon">🕵️</div>
    <h1>Silent Contract</h1>
    <p>Turn-based stealth heist. Get in, take the loot, get out. Every turn the alarm rises.</p>
    <p class="soon">Coming soon</p>
  </main>
`;
