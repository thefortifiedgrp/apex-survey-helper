import { render } from 'solid-js/web';
import { Survey } from './Survey';

render(
  () => (
    <main style={{ 'max-width': '560px', margin: '3rem auto', 'font-family': 'system-ui, sans-serif' }}>
      <h1>Apex Survey — Solid example</h1>
      <Survey />
    </main>
  ),
  document.getElementById('root')!,
);
