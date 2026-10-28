import { useRef, useState } from "react";
export type CmsTask = ReturnType<typeof useCmsTask>;
// All mutations share this gate, including bulk jobs and nested upload screens.
export function useCmsTask() {
  const running = useRef(false);
  const [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [message, setMessage] = useState("");
  const run = async <T>(work: () => Promise<T>): Promise<T | undefined> => {
    if (running.current) return;
    running.current = true;
    setBusy(true);
    setError("");
    setMessage("");
    try {
      return await work();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      running.current = false;
      setBusy(false);
    }
  };
  return { busy, setBusy, error, setError, message, setMessage, running, run };
}
