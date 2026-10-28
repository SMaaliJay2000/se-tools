import { useCallback, useState } from "react";

interface ActionState<R> {
  data?: R;
  error?: string;
  loading: boolean;
}

/** Wraps an async API call with loading/error/data state. `run` resolves to the data, or undefined on failure. */
export function useAction<A extends unknown[], R>(fn: (...args: A) => Promise<R>) {
  const [state, setState] = useState<ActionState<R>>({ loading: false });

  const run = useCallback(
    async (...args: A): Promise<R | undefined> => {
      setState((s) => ({ data: s.data, loading: true }));
      try {
        const data = await fn(...args);
        setState({ data, loading: false });
        return data;
      } catch (e) {
        // Drop the previous result: showing it next to a fresh error would misrepresent what just happened.
        setState({ loading: false, error: e instanceof Error ? e.message : String(e) });
        return undefined;
      }
    },
    [fn],
  );

  const reset = useCallback(() => setState({ loading: false }), []);
  return { ...state, run, reset };
}
