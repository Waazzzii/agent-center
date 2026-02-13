'use client';

import { Control, Controller } from 'react-hook-form';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ConnectorSchemaField } from '@/types/api.types';

interface NumberFieldProps {
  field: ConnectorSchemaField;
  control: Control<any>;
  error?: string;
}

export function NumberField({ field, control, error }: NumberFieldProps) {
  return (
    <div className="space-y-2">
      <Label htmlFor={field.key}>
        {field.label}
        {field.required && <span className="text-destructive ml-1">*</span>}
      </Label>
      <Controller
        name={field.key}
        control={control}
        defaultValue={field.default || ''}
        render={({ field: formField }) => (
          <Input
            {...formField}
            id={field.key}
            type="number"
            placeholder={field.placeholder}
            min={field.validation?.min}
            max={field.validation?.max}
            onChange={(e) => {
              const value = e.target.value;
              formField.onChange(value === '' ? '' : Number(value));
            }}
            className={error ? 'border-destructive' : ''}
          />
        )}
      />
      {field.helpText && (
        <p className="text-sm text-muted-foreground">{field.helpText}</p>
      )}
      {error && <p className="text-sm text-destructive">{error}</p>}
    </div>
  );
}
