'use client';

import { useState } from 'react';
import { Control, Controller } from 'react-hook-form';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { ConnectorSchemaField } from '@/types/api.types';
import { Eye, EyeOff } from 'lucide-react';

interface SecretFieldProps {
  field: ConnectorSchemaField;
  control: Control<any>;
  error?: string;
  maskedValue?: string;
}

export function SecretField({
  field,
  control,
  error,
  maskedValue,
}: SecretFieldProps) {
  const [showPassword, setShowPassword] = useState(false);

  return (
    <div className="space-y-2">
      <Label htmlFor={field.key}>
        {field.label}
        {field.required && <span className="text-destructive ml-1">*</span>}
      </Label>
      {maskedValue && (
        <p className="text-xs text-muted-foreground">
          Current: <span className="font-mono">{maskedValue}</span> (enter new value to update)
        </p>
      )}
      <div className="relative">
        <Controller
          name={field.key}
          control={control}
          render={({ field: formField }) => (
            <Input
              {...formField}
              id={field.key}
              type={showPassword ? 'text' : 'password'}
              placeholder={maskedValue || field.placeholder}
              className={error ? 'border-destructive pr-10' : 'pr-10'}
            />
          )}
        />
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="absolute right-0 top-0 h-full px-3 py-2 hover:bg-transparent"
          onClick={() => setShowPassword(!showPassword)}
        >
          {showPassword ? (
            <EyeOff className="h-4 w-4 text-muted-foreground" />
          ) : (
            <Eye className="h-4 w-4 text-muted-foreground" />
          )}
        </Button>
      </div>
      {field.helpText && (
        <p className="text-sm text-muted-foreground">{field.helpText}</p>
      )}
      {error && <p className="text-sm text-destructive">{error}</p>}
    </div>
  );
}
