'use client';

import { Control } from 'react-hook-form';
import { ConnectorSchemaField } from '@/types/api.types';
import { TextField } from './text-field';
import { TextareaField } from './textarea-field';
import { NumberField } from './number-field';
import { BooleanField } from './boolean-field';
import { SelectField } from './select-field';
import { SecretField } from './secret-field';

interface FieldRendererProps {
  field: ConnectorSchemaField;
  control: Control<any>;
  error?: string;
  maskedValue?: string;
  disabled?: boolean;
}

export function FieldRenderer({
  field,
  control,
  error,
  maskedValue,
  disabled,
}: FieldRendererProps) {
  // Secret fields get special handling
  if (field.secret || field.type === 'password') {
    return (
      <SecretField
        field={field}
        control={control}
        error={error}
        maskedValue={maskedValue}
        disabled={disabled}
      />
    );
  }

  // Route to appropriate field component based on type
  switch (field.type) {
    case 'textarea':
      return <TextareaField field={field} control={control} error={error} disabled={disabled} />;

    case 'number':
      return <NumberField field={field} control={control} error={error} disabled={disabled} />;

    case 'boolean':
      return <BooleanField field={field} control={control} error={error} disabled={disabled} />;

    case 'select':
      return <SelectField field={field} control={control} error={error} disabled={disabled} />;

    case 'text':
    case 'url':
    case 'email':
    default:
      return <TextField field={field} control={control} error={error} disabled={disabled} />;
  }
}
