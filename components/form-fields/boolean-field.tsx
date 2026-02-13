'use client';

import { Control, Controller } from 'react-hook-form';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { ConnectorSchemaField } from '@/types/api.types';

interface BooleanFieldProps {
  field: ConnectorSchemaField;
  control: Control<any>;
  error?: string;
}

export function BooleanField({ field, control, error }: BooleanFieldProps) {
  return (
    <div className="space-y-2">
      <div className="flex items-center space-x-2">
        <Controller
          name={field.key}
          control={control}
          defaultValue={field.default || false}
          render={({ field: formField }) => (
            <Switch
              id={field.key}
              checked={formField.value}
              onCheckedChange={formField.onChange}
            />
          )}
        />
        <Label htmlFor={field.key} className="cursor-pointer">
          {field.label}
          {field.required && <span className="text-destructive ml-1">*</span>}
        </Label>
      </div>
      {field.helpText && (
        <p className="text-sm text-muted-foreground">{field.helpText}</p>
      )}
      {error && <p className="text-sm text-destructive">{error}</p>}
    </div>
  );
}
