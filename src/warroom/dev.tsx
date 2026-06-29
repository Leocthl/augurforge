import ReactDOM from 'react-dom/client';
import { WarRoom } from './WarRoom';
import './warroom.css';

const el = document.getElementById('root');
if (!el) throw new Error('#root not found');
ReactDOM.createRoot(el).render(<WarRoom />);