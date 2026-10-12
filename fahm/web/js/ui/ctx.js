import { createContext, useContext } from './h.js';

export const AppCtx = createContext(null);
export const useApp = () => useContext(AppCtx);
