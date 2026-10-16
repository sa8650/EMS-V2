'use client';

import { X } from 'lucide-react';
import { createContext, useCallback, useContext, useRef, type ReactNode } from 'react';
import { buttonClass } from './button';
import s from './ui.module.css';

const CloseContext = createContext<() => void>(() => undefined);

/** Closes the surrounding Dialog (e.g. pass to ActionForm's onSuccess). */
export const useCloseDialog = () => useContext(CloseContext);

/**
 * Modal dialog on the native <dialog> element: focus is trapped and restored by
 * the browser, Escape closes it, the backdrop is inert.
 */
export function Dialog({
  trigger,
  triggerVariant = 'primary',
  triggerSize,
  title,
  wide,
  children,
}: {
  trigger: ReactNode;
  triggerVariant?: 'default' | 'primary' | 'ghost' | 'danger';
  triggerSize?: 'default' | 'small';
  title: string;
  wide?: boolean;
  children: ReactNode;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const close = useCallback(() => ref.current?.close(), []);
  return (
    <>
      <button type="button" className={buttonClass({ variant: triggerVariant, size: triggerSize })} onClick={() => ref.current?.showModal()}>
        {trigger}
      </button>
      <dialog ref={ref} className={[s.dialog, wide && s.dialogWide].filter(Boolean).join(' ')} aria-label={title}>
        <div className={s.dialogHeader}>
          <h2 className={s.dialogTitle}>{title}</h2>
          <button type="button" className={buttonClass({ variant: 'ghost', size: 'small', iconOnly: true })} onClick={close} aria-label="Close">
            <X aria-hidden />
          </button>
        </div>
        <div className={s.dialogBody}>
          <CloseContext.Provider value={close}>{children}</CloseContext.Provider>
        </div>
      </dialog>
    </>
  );
}
