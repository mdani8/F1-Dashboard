import { createRoot } from 'react-dom/client';
import { App } from './App.jsx';
import { MotionProvider } from './motion.jsx';
import { FavouritesProvider } from './Favourites.jsx';
import './styles.css';

createRoot(document.getElementById('root')).render(<MotionProvider><FavouritesProvider><App /></FavouritesProvider></MotionProvider>);
