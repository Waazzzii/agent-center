'use client';

import { Control, Controller } from 'react-hook-form';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { ConnectorSchemaField } from '@/types/api.types';

interface TextareaFieldProps {
  field: ConnectorSchemaField;
  control: Control<any>;
  error?: string;
}

export function TextareaField({ field, control, error }: TextareaFieldProps) {
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
          <Textarea
            {...formField}
            id={field.key}
            placeholder={field.placeholder}
            rows={4}
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
