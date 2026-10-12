// Android's back button: the most recently opened layer (sheet, session, screen ...) gets first say.
import { useEffect, useRef } from './h.js';

const stack = [];

export function useBack(handler, active = true) {
  const ref = useRef(handler);
  ref.current = handler;
  useEffect(() => {
    if (!active) return undefined;
    const fn = () => ref.current();
    stack.push(fn);
    return () => {
      const i = stack.lastIndexOf(fn);
      if (i >= 0) stack.splice(i, 1);
    };
  }, [active]);
}

/** Called by the native shell. Returns true when something consumed the back press. */
export function handleBack() {
  for (let i = stack.length - 1; i >= 0; i--) {
    if (stack[i]() !== false) return true;
  }
  return false;
}
