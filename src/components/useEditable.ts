import {
  cloneElement,
  useState,
  type ChangeEvent,
  type FocusEvent,
  type InputHTMLAttributes,
  type KeyboardEvent,
  type ReactElement,
} from 'react';

type Editable =
  | { editing: false; edit: () => void }
  | { editing: true; input: ReactElement; submit: () => void; cancel: () => void };

// A commit-on-submit edit toggle around a caller-supplied input node. Read-only
// until `edit()`; then the node carries a private draft that reaches `onCommit`
// only on `submit` (OK / Enter) — Escape discards it. The hook owns value and
// event handlers; the node's appearance and semantics stay the caller's.
export function useEditable(
  value: string | number,
  onCommit: (raw: string) => void,
  input: ReactElement<InputHTMLAttributes<HTMLInputElement>>,
): Editable {
  const [draft, setDraft] = useState<string | null>(null);

  if (draft === null) {
    const edit = () => {
      setDraft(String(value));
    };
    return { editing: false, edit };
  }

  const submit = () => {
    onCommit(draft);
    setDraft(null);
  };

  const cancel = () => {
    setDraft(null);
  };

  return {
    editing: true,
    submit,
    cancel,
    input: cloneElement(input, {
      value: draft,
      autoFocus: true,
      onChange: (e: ChangeEvent<HTMLInputElement>) => setDraft(e.target.value),
      onFocus: (e: FocusEvent<HTMLInputElement>) => e.target.select(),
      onKeyDown: (e: KeyboardEvent<HTMLInputElement>) => {
        if (e.key === 'Enter') submit();
        else if (e.key === 'Escape') cancel();
      },
    }),
  };
}
