'use client';

import { useId } from 'react';

type FieldBase = {
  id?: string;
  label: string;
  hint?: string;
  disabled?: boolean;
  required?: boolean;
  className?: string;
};

export function TextField(
  input: FieldBase & {
    value: string;
    onChange: (value: string) => void;
    type?: 'text' | 'email' | 'number' | 'date' | 'search' | 'url' | 'password';
    placeholder?: string;
    min?: number;
    max?: number;
    step?: number;
    autoComplete?: string;
    inputMode?: 'numeric' | 'decimal';
  }
) {
  const generatedId = useId();
  const id = input.id ?? generatedId;
  return (
    <div className={'admin-field' + (input.className ? ' ' + input.className : '')}>
      <label className="label" htmlFor={id}>
        {input.label}
        {input.required ? <span aria-hidden="true"> *</span> : null}
      </label>
      <input
        id={id}
        className="input"
        type={input.type ?? 'text'}
        value={input.value}
        onChange={(event) => input.onChange(event.target.value)}
        placeholder={input.placeholder}
        disabled={input.disabled}
        required={input.required}
        min={input.min}
        max={input.max}
        step={input.step}
        autoComplete={input.autoComplete}
        inputMode={input.inputMode}
      />
      {input.hint ? <span className="admin-field-hint">{input.hint}</span> : null}
    </div>
  );
}

export function TextareaField(
  input: FieldBase & {
    value: string;
    onChange: (value: string) => void;
    rows?: number;
    placeholder?: string;
  }
) {
  const generatedId = useId();
  const id = input.id ?? generatedId;
  return (
    <div className={'admin-field' + (input.className ? ' ' + input.className : '')}>
      <label className="label" htmlFor={id}>
        {input.label}
        {input.required ? <span aria-hidden="true"> *</span> : null}
      </label>
      <textarea
        id={id}
        className="input textarea"
        rows={input.rows ?? 4}
        value={input.value}
        onChange={(event) => input.onChange(event.target.value)}
        placeholder={input.placeholder}
        disabled={input.disabled}
        required={input.required}
      />
      {input.hint ? <span className="admin-field-hint">{input.hint}</span> : null}
    </div>
  );
}

export function SelectField(
  input: FieldBase & {
    value: string;
    onChange: (value: string) => void;
    options: Array<{ value: string; label: string }>;
    placeholder?: string;
  }
) {
  const generatedId = useId();
  const id = input.id ?? generatedId;
  return (
    <div className={'admin-field' + (input.className ? ' ' + input.className : '')}>
      <label className="label" htmlFor={id}>
        {input.label}
        {input.required ? <span aria-hidden="true"> *</span> : null}
      </label>
      <select
        id={id}
        className="input"
        value={input.value}
        onChange={(event) => input.onChange(event.target.value)}
        disabled={input.disabled}
        required={input.required}
      >
        {input.placeholder ? <option value="">{input.placeholder}</option> : null}
        {input.options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
      {input.hint ? <span className="admin-field-hint">{input.hint}</span> : null}
    </div>
  );
}

export function CheckboxField(input: {
  id?: string;
  label: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
  hint?: string;
  disabled?: boolean;
  className?: string;
}) {
  const generatedId = useId();
  const id = input.id ?? generatedId;
  return (
    <div className={'admin-field admin-field--checkbox' + (input.className ? ' ' + input.className : '')}>
      <label className="admin-checkbox" htmlFor={id}>
        <input
          id={id}
          type="checkbox"
          checked={input.checked}
          onChange={(event) => input.onChange(event.target.checked)}
          disabled={input.disabled}
        />
        <span>{input.label}</span>
      </label>
      {input.hint ? <span className="admin-field-hint">{input.hint}</span> : null}
    </div>
  );
}
