import { createContext, useContext } from 'react';
import { resolveTheme } from './capabilities.js';

export const ThemeContext = createContext(resolveTheme('truecolor'));

export const useTheme = () => useContext(ThemeContext);
