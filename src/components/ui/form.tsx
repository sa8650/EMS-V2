'use client';

import { createContext, useActionState, useContext, useEffect, useId, useRef, type ComponentProps, type ReactNode } from 'react';
import { useFormStatus } from 'react-dom';
import { IDLE, type ActionState } from '@/lib/action-state';
import { buttonClass } from './button';
import { Alert } from './display';
import s from './ui.module.css';

type ServerAction = (state: ActionState, form: FormData) => Promise<ActionState>;

const FormStateContext = createContext<ActionState>(IDLE);

/**
 * A form bound to a Server Action with useActionState. Fields inside it show
 * the server's field messages; the result message appears above the buttons.
 */
export function ActionForm({
  action,
  submitLabel,
  children,
  resetOnSuccess,
  onSuccess,
  secondary,
  submitVariant = 'primary',
  block,
}: {
  action: ServerAction;
  submitLabel: string;
  children: ReactNode;
  resetOnSuccess?: boolean;
  onSuccess?: () => void;
  secondary?: ReactNode;
  submitVariant?: 'primary' | 'danger';
  block?: boolean;
}) {
  const [state, formAction] = useActionState(action, IDLE);
  const ref = useRef<HTMLFormElement>(null);
  const handled = useRef<number | undefined>(undefined);
  useEffect(() => {
    if (state.status !== 'success' || state.at === handled.current) return;
    handled.current = state.at;
    if (resetOnSuccess) ref.current?.reset();
    onSuccess?.();
  }, [state, resetOnSuccess, onSuccess]);

  return (
    <FormStateContext.Provider value={state}>
      <form ref={ref} action={formAction} className={s.form} noValidate>
        {children}
        <FormMessage state={state} />
        <div className={s.formActions}>
          {secondary}
          <SubmitButton variant={submitVariant} block={block}>
            {submitLabel}
          </SubmitButton>
        </div>
      </form>
    </FormStateContext.Provider>
  );
}

export function FormMessage({ state }: { state: ActionState }) {
  if (!state.message || state.status === 'idle') return null;
  return <Alert tone={state.status === 'success' ? 'success' : 'danger'}>{state.message}</Alert>;
}

export function SubmitButton({ children, variant = 'primary', block }: { children: ReactNode; variant?: 'primary' | 'danger'; block?: boolean }) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" className={buttonClass({ variant, block })} disabled={pending} aria-busy={pending}>
      {pending ? 'Working…' : children}
    </button>
  );
}

export function FormGrid({ children }: { children: ReactNode }) {
  return <div className={s.formGrid}>{children}</div>;
}

interface FieldProps {
  label: string;
  name: string;
  hint?: ReactNode;
  optional?: boolean;
}

function useField(name: string) {
  const state = useContext(FormStateContext);
  const id = useId();
  const error = state.status === 'error' ? state.fields?.[name] : undefined;
  return { id, error };
}

function FieldShell({ id, label, hint, error, optional, children }: { id: string; label: string; hint?: ReactNode; error?: string; optional?: boolean; children: ReactNode }) {
  return (
    <div className={s.field}>
      <label className={s.label} htmlFor={id}>
        {label} {optional && <span className={s.optional}>(optional)</span>}
      </label>
      {children}
      {error ? (
        <span className={s.error} id={`${id}-error`}>
          {error}
        </span>
      ) : hint ? (
        <span className={s.hint} id={`${id}-hint`}>
          {hint}
        </span>
      ) : null}
    </div>
  );
}

const describedBy = (id: string, error?: string, hint?: ReactNode) => (error ? `${id}-error` : hint ? `${id}-hint` : undefined);

export function TextField({ label, name, hint, optional, ...input }: FieldProps & Omit<ComponentProps<'input'>, 'name'>) {
  const { id, error } = useField(name);
  return (
    <FieldShell id={id} label={label} hint={hint} error={error} optional={optional}>
      <input id={id} name={name} className={s.control} aria-invalid={error ? true : undefined} aria-describedby={describedBy(id, error, hint)} required={!optional} {...input} />
    </FieldShell>
  );
}

export function TextArea({ label, name, hint, optional, ...input }: FieldProps & Omit<ComponentProps<'textarea'>, 'name'>) {
  const { id, error } = useField(name);
  return (
    <FieldShell id={id} label={label} hint={hint} error={error} optional={optional}>
      <textarea id={id} name={name} className={s.control} aria-invalid={error ? true : undefined} aria-describedby={describedBy(id, error, hint)} required={!optional} {...input} />
    </FieldShell>
  );
}

export function SelectField({ label, name, hint, optional, options, ...input }: FieldProps & { options: { value: string; label: string }[] } & Omit<ComponentProps<'select'>, 'name'>) {
  const { id, error } = useField(name);
  return (
    <FieldShell id={id} label={label} hint={hint} error={error} optional={optional}>
      <select id={id} name={name} className={s.control} aria-invalid={error ? true : undefined} aria-describedby={describedBy(id, error, hint)} required={!optional} {...input}>
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </FieldShell>
  );
}

export function CheckboxField({ label, name, ...input }: { label: string; name: string } & Omit<ComponentProps<'input'>, 'name' | 'type'>) {
  return (
    <label className={s.check}>
      <input type="checkbox" name={name} value="on" {...input} />
      {label}
    </label>
  );
}
