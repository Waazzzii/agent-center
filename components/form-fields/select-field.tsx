'use client';

import { Control, Controller } from 'react-hook-form';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { ConnectorSchemaField } from '@/types/api.types';

interface SelectFieldProps {
  field: ConnectorSchemaField;
  control: Control<any>;
  error?: string;
}

export function SelectField({ field, control, error }: SelectFieldProps) {
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
          <Select
            value={formField.value}
            onValueChange={formField.onChange}
          >
            <SelectTrigger id={field.key} className={error ? 'border-destructive' : ''}>
              <SelectValue placeholder={field.placeholder || 'Select an option'} />
            </SelectTrigger>
            <SelectContent>
              {field.options?.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
      />
      {field.helpText && (
        <p className="text-sm text-muted-foreground">{field.helpText}</p>
      )}
      {error && <p className="text-sm text-destructive">{error}</p>}
    </div>
  );
}
