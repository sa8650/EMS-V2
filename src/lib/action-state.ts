/** Result of a form Server Action, rendered by the form that submitted it. */
export interface ActionState {
  status: 'idle' | 'success' | 'error';
  message?: string;
  /** Field name → message, shown next to the field. */
  fields?: Record<string, string>;
  /** Changes after every submission so forms can reset or close on success. */
  at?: number;
}

export const IDLE: ActionState = { status: 'idle' };
