import { useEffect, useId, useRef, useState, type ReactNode, type Ref } from 'react';
import { dollars, formatMoney, parseTyped, type Diff, type Money } from './core';
import { href } from './router';

export function Amount({ value, className = '' }: { value: Money; className?: string }) {
  return <span className={`money ${className}`}>{formatMoney(value)}</span>;
}

/** A difference from plan. The tone sets colour; the words or sign carry the meaning. */
export function DiffText({ diff, className = '' }: { diff: Diff; className?: string }) {
  const tone = diff.tone === 'flat' ? '' : diff.tone;
  return <span className={`money ${tone} ${className}`}>{diff.text}</span>;
}

export function Back({ to, children }: { to: string; children: ReactNode }) {
  return (
    <a className="back" href={href(to)}>
      <span aria-hidden="true">{'‹'}&nbsp;</span>
      {children}
    </a>
  );
}

// ---------- number inputs ----------

const trim = (n: number) => String(Math.round(n * 100) / 100);

interface NumberInputProps {
  id?: string;
  value: number | undefined;
  onChange: (value: number | undefined) => void;
  prefix?: string;
  suffix?: string;
  placeholder?: string;
  ariaLabel?: string;
  describedBy?: string;
  /** For a figure that is always a number: 0 shows as an empty field, and an empty field reports 0. */
  emptyIsZero?: boolean;
}

/**
 * A text field that holds a number. It keeps what was typed (so "12." is not
 * rewritten mid-entry) and reports a number, or undefined when left empty.
 * Text that is not a number is flagged and reported as empty, so what is
 * saved never differs from what the field shows.
 */
export function NumberInput({ id, value, onChange, prefix, suffix, placeholder, ariaLabel, describedBy, emptyIsZero }: NumberInputProps) {
  const show = (v: number | undefined) => (v === undefined || (emptyIsZero && v === 0) ? '' : trim(v));
  const [text, setText] = useState(() => show(value));
  const last = useRef(value);

  useEffect(() => {
    if (value !== last.current) {
      last.current = value;
      setText(show(value));
    }
  }, [value]);

  const invalid = parseTyped(text) === 'invalid';
  const errorId = useId();

  return (
    <div className="number">
      <div className={`affix ${prefix ? 'pre' : ''} ${suffix ? 'post' : ''}`}>
        {prefix && <span aria-hidden="true">{prefix}</span>}
        <input
          id={id}
          className="input"
          type="text"
          inputMode="decimal"
          autoComplete="off"
          value={text}
          placeholder={placeholder ?? (emptyIsZero ? '0' : undefined)}
          aria-label={ariaLabel}
          aria-describedby={invalid ? errorId : describedBy}
          aria-invalid={invalid || undefined}
          onChange={(e) => {
            setText(e.target.value);
            const parsed = parseTyped(e.target.value);
            const number = parsed === 'invalid' ? undefined : parsed;
            const next = emptyIsZero ? (number ?? 0) : number;
            last.current = next;
            onChange(next);
          }}
        />
        {suffix && <span aria-hidden="true">{suffix}</span>}
      </div>
      {invalid && (
        <p className="note bad" id={errorId} role="alert">
          {emptyIsZero ? 'Not a number, so this counts as 0.' : 'Not a number, so nothing is saved here.'}
        </p>
      )}
    </div>
  );
}

type MoneyInputProps = Omit<NumberInputProps, 'value' | 'onChange' | 'prefix'> & {
  value: Money | undefined;
  onChange: (value: Money | undefined) => void;
};

/** Dollars on screen, cents in the data. */
export function MoneyInput({ value, onChange, ...rest }: MoneyInputProps) {
  return (
    <NumberInput
      {...rest}
      prefix="$"
      value={value === undefined ? undefined : value / 100}
      onChange={(n) => onChange(n === undefined ? undefined : dollars(n))}
    />
  );
}

export function Field({ label, note, children }: { label: string; note?: ReactNode; children: (id: string, noteId?: string) => ReactNode }) {
  const id = useId();
  const noteId = note ? id + '-note' : undefined;
  return (
    <div className="field">
      <label htmlFor={id}>{label}</label>
      {children(id, noteId)}
      {note && (
        <p className="note" id={noteId}>
          {note}
        </p>
      )}
    </div>
  );
}

export function TextField({
  label,
  value,
  onChange,
  note,
  type = 'text',
  autoFocus,
  inputRef,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  note?: ReactNode;
  type?: string;
  autoFocus?: boolean;
  inputRef?: Ref<HTMLInputElement>;
}) {
  return (
    <Field label={label} note={note}>
      {(id, noteId) => <input id={id} ref={inputRef} className="input" type={type} value={value} autoFocus={autoFocus} aria-describedby={noteId} onChange={(e) => onChange(e.target.value)} />}
    </Field>
  );
}

export function MoneyField({ label, value, onChange, note, placeholder, emptyIsZero }: { label: string; value: Money | undefined; onChange: (v: Money | undefined) => void; note?: ReactNode; placeholder?: string; emptyIsZero?: boolean }) {
  return (
    <Field label={label} note={note}>
      {(id, noteId) => <MoneyInput id={id} value={value} onChange={onChange} describedBy={noteId} placeholder={placeholder} emptyIsZero={emptyIsZero} />}
    </Field>
  );
}

export function NumberField({
  label,
  value,
  onChange,
  note,
  suffix,
  emptyIsZero,
  placeholder,
}: {
  label: string;
  value: number | undefined;
  onChange: (v: number | undefined) => void;
  note?: ReactNode;
  suffix?: string;
  emptyIsZero?: boolean;
  placeholder?: string;
}) {
  return (
    <Field label={label} note={note}>
      {(id, noteId) => <NumberInput id={id} value={value} onChange={onChange} describedBy={noteId} suffix={suffix} emptyIsZero={emptyIsZero} placeholder={placeholder} />}
    </Field>
  );
}

export function SelectField<T extends string>({ label, value, onChange, options, note }: { label: string; value: T; onChange: (v: T) => void; options: [T, string][]; note?: ReactNode }) {
  return (
    <Field label={label} note={note}>
      {(id, noteId) => (
        <select id={id} className="input" value={value} aria-describedby={noteId} onChange={(e) => onChange(e.target.value as T)}>
          {options.map(([v, text]) => (
            <option key={v} value={v}>
              {text}
            </option>
          ))}
        </select>
      )}
    </Field>
  );
}

export function Check({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="check">
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      {label}
    </label>
  );
}
