import ReactDOM from 'react-dom/client';
import { DepthExplainer } from './DepthExplainer';
import './explainer.css';

const el = document.getElementById('root');
if (!el) throw new Error('#root not found');
ReactDOM.createRoot(el).render(<DepthExplainer />);