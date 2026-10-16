import './style.css';

// Placeholder until this game is built. See README.md for the design.
const app = document.querySelector<HTMLDivElement>('#app')!;
app.innerHTML = `
  <main>
    <div class="icon">✏️</div>
    <h1>Ink Bridge</h1>
    <p>Line-drawing physics puzzle. Draw a shape. It falls, rolls and pushes. Get the ball to the goal.</p>
    <p class="soon">Coming soon</p>
  </main>
`;
