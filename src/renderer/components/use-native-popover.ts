import {
  useEffect,
  type FocusEvent,
  type RefObject,
  type ToggleEvent,
} from 'react';

export function useNativePopover(
  popup: RefObject<HTMLElement | null>,
  invoker: RefObject<HTMLElement | null>,
  initialFocus: RefObject<HTMLElement | null>,
  onClose: (restoreFocus: boolean) => void,
) {
  useEffect(() => {
    // Preserve native light dismissal, top-layer placement and focus order.
    // https://developer.mozilla.org/en-US/docs/Web/API/HTMLElement/showPopover
    popup.current?.showPopover({ source: invoker.current ?? undefined });
    initialFocus.current?.focus({ preventScroll: true });
  }, [popup, invoker, initialFocus]);
  return {
    onToggle(event: ToggleEvent<HTMLElement>) {
      if (event.newState === 'closed') onClose(false);
    },
    onBlur(event: FocusEvent<HTMLElement>) {
      if (
        !event.currentTarget.contains(event.relatedTarget) &&
        event.relatedTarget !== invoker.current
      )
        onClose(false);
    },
  };
}
