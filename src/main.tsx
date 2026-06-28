import ReactDOM from 'react-dom/client';
import { App } from './app/App';
import './index.css';

// StrictMode is intentionally omitted: the 2D/3D renderers mount imperative Plotly/Three.js
// canvases inside effects, and StrictMode's dev-only double-invoke would double-init WebGL
// contexts. Real unmounts are handled by Renderer.destroy(). See src/app/Renderer.tsx.
const rootEl = document.getElementById('root');
if (!rootEl) throw new Error('Root element #root not found in index.html');
ReactDOM.createRoot(rootEl).render(<App />);