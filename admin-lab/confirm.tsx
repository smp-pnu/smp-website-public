import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";

export type ConfirmOptions = {
  title?: string;
  preview?: string;
  previewLabel?: string;
  cancelLabel?: string;
  acceptLabel?: string;
};
type Confirm = (message: string, options?: ConfirmOptions) => Promise<boolean>;
const Context = createContext<Confirm | null>(null);

export function ConfirmationProvider({ children }: { children: ReactNode }) {
  const [message, setMessage] = useState("");
  const [options, setOptions] = useState<ConfirmOptions>({});
  const pending = useRef<((answer: boolean) => void) | null>(null);
  const previousFocus = useRef<HTMLElement | null>(null);
  const cancel = useRef<HTMLButtonElement>(null);
  const accept = useRef<HTMLButtonElement>(null);
  const finish = useCallback((answer: boolean) => {
    const resolve = pending.current;
    pending.current = null;
    setMessage("");
    setOptions({});
    resolve?.(answer);
  }, []);
  const ask = useCallback<Confirm>((text, details = {}) => {
    if (pending.current) return Promise.resolve(false);
    previousFocus.current = document.activeElement as HTMLElement | null;
    return new Promise((resolve) => {
      pending.current = resolve;
      setMessage(text);
      setOptions(details);
    });
  }, []);
  useEffect(() => {
    if (!message) {
      // React has removed inert by this effect, so focus can return to the opener.
      if (previousFocus.current?.isConnected) previousFocus.current.focus();
      previousFocus.current = null;
      return;
    }
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    cancel.current?.focus();
    const key = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        finish(false);
      }
      if (event.key === "Tab") {
        event.preventDefault();
        if (document.activeElement === cancel.current) accept.current?.focus();
        else cancel.current?.focus();
      }
    };
    document.addEventListener("keydown", key, true);
    return () => {
      document.removeEventListener("keydown", key, true);
      document.body.style.overflow = overflow;
    };
  }, [message, finish]);
  useEffect(
    () => () => {
      pending.current?.(false);
    },
    [],
  );
  return (
    <Context.Provider value={ask}>
      <div inert={!!message}>{children}</div>
      {message && (
        <div className="confirm-backdrop">
          <section
            className="confirm-dialog"
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="confirm-title"
            aria-describedby="confirm-message"
          >
            <h2 id="confirm-title">
              {options.title ?? "변경하기 전에 확인해 주세요"}
            </h2>
            <p id="confirm-message">{message}</p>
            {options.preview && (
              <pre
                className="transmission-preview"
                aria-label={options.previewLabel ?? "AI에 전달될 텍스트"}
              >
                {options.preview}
              </pre>
            )}
            <div className="button-row">
              <button
                ref={cancel}
                className="secondary"
                onClick={() => finish(false)}
              >
                {options.cancelLabel ?? "취소"}
              </button>
              <button
                ref={accept}
                className="primary"
                onClick={() => finish(true)}
              >
                {options.acceptLabel ?? "확인"}
              </button>
            </div>
          </section>
        </div>
      )}
    </Context.Provider>
  );
}
export function useConfirmation() {
  const ask = useContext(Context);
  if (!ask) throw Error("ConfirmationProvider is required");
  return ask;
}
