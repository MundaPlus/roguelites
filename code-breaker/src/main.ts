import './style.css';

// Placeholder until this game is built. See README.md for the design.
const app = document.querySelector<HTMLDivElement>('#app')!;
app.innerHTML = `
  <main>
    <div class="icon">🔐</div>
    <h1>Code Breaker</h1>
    <p>Deduction puzzle. Guess the code. Read the hints. Fewer guesses, more power.</p>
    <p class="soon">Coming soon</p>
  </main>
`;
