'use client';

import { useState, useMemo } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { ConnectorConfigSchema } from '@/types/api.types';
import { schemaToZod } from '@/lib/schema-to-zod';
import { FieldRenderer } from './form-fields/field-renderer';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Loader2, Lock, Settings } from 'lucide-react';
import { toast } from 'sonner';
import { TokenHealthStatusDisplay } from './token-health-status';
import type { TokenHealthStatus } from '@/types/api.types';

interface DynamicConnectorFormProps {
  schema: ConnectorConfigSchema;
  initialValues?: Record<string, any>;
  existingSecrets?: string[]; // Keys of secrets that exist (for required validation)
  maskedSecrets?: Record<string, string>; // Masked secret values (e.g., {"api_key": "••••••••1234"})
  // Token health status (for connectors with expiring tokens)
  tokenHealthStatus?: TokenHealthStatus;
  tokenExpiresAt?: string;
  tokenLastRenewedAt?: string;
  onSubmit: (config: Record<string, any>, secrets: Record<string, string>) => Promise<void>;
  loading?: boolean;
  disabled?: boolean;
}

export function DynamicConnectorForm({
  schema,
  initialValues = {},
  existingSecrets = [],
  maskedSecrets = {},
  tokenHealthStatus,
  tokenExpiresAt,
  tokenLastRenewedAt,
  onSubmit,
  loading = false,
  disabled = false,
}: DynamicConnectorFormProps) {
  // Track original masked values to detect if user changed them
  const [secretMasks] = useState<Record<string, string>>(maskedSecrets);

  // Ensure all fields have default values (prevents uncontrolled -> controlled warning)
  const formInitialValues = useMemo(() => {
    const merged = { ...initialValues };

    // Initialize all fields with appropriate default values to prevent React warnings
    schema.fields.forEach((field) => {
      if (merged[field.key] === undefined) {
        // Set default based on field type
        switch (field.type) {
          case 'boolean':
            merged[field.key] = field.default ?? false;
            break;
          case 'number':
            merged[field.key] = field.default ?? '';
            break;
          default:
            // text, textarea, password, url, email, select
            merged[field.key] = '';
        }
      }
    });

    return merged;
  }, [initialValues, schema.fields]);

  // Separate fields into configuration and secrets
  const { configFields, secretFields } = useMemo(() => {
    const configFields = schema.fields.filter(f => !f.secret && f.type !== 'password');
    const secretFields = schema.fields.filter(f => f.secret || f.type === 'password');
    return { configFields, secretFields };
  }, [schema.fields]);

  // Generate Zod schema from configuration schema
  const zodSchema = schemaToZod(schema);

  const {
    control,
    handleSubmit,
    formState: { errors },
  } = useForm({
    resolver: zodResolver(zodSchema),
    defaultValues: formInitialValues,
    mode: 'onSubmit',
  });

  const handleFormSubmit = async (data: Record<string, any>) => {
    try {
      // Separate regular config from secrets
      const config: Record<string, any> = {};
      const secrets: Record<string, string> = {};

      // Track missing required fields
      const missingRequired: string[] = [];

      schema.fields.forEach((field) => {
        const value = data[field.key];
        const isSecret = field.secret || field.type === 'password';
        const isExisting = existingSecrets.includes(field.key);
        const maskedValue = secretMasks[field.key];

        // Check if required field is missing
        if (field.required) {
          if (isSecret) {
            // For secrets: only required if it's new (doesn't exist yet)
            if (!isExisting && (!value || value === '')) {
              missingRequired.push(field.label);
            }
          } else {
            // For regular fields: always required
            if (!value || value === '') {
              missingRequired.push(field.label);
            }
          }
        }

        // Skip if value is undefined or empty string
        if (value === undefined || value === '') {
          return;
        }

        if (isSecret) {
          // Only include secret if the value was actually provided and changed
          // Don't send if it's still empty (existing secret not being updated)
          if (value && value !== '') {
            secrets[field.key] = value;
          }
        } else {
          config[field.key] = value;
        }
      });

      // Show error if required fields are missing
      if (missingRequired.length > 0) {
        toast.error('Required fields missing', {
          description: `Please fill in: ${missingRequired.join(', ')}`,
        });
        return;
      }

      await onSubmit(config, secrets);
    } catch (error) {
      console.error('[FORM] Failed to save configuration');
      toast.error('Failed to save configuration', {
        description: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  };

  const handleFormError = (errors: any) => {
    const errorMessages = Object.entries(errors)
      .map(([key, error]: [string, any]) => {
        const field = schema.fields.find(f => f.key === key);
        const fieldLabel = field?.label || key;
        return `${fieldLabel}: ${error.message}`;
      })
      .join(', ');

    toast.error('Validation failed', {
      description: errorMessages,
    });
  };


  return (
    <form onSubmit={handleSubmit(handleFormSubmit, handleFormError)} className="space-y-6">
      {/* Configuration Section */}
      {configFields.length > 0 && (
        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <Settings className="h-5 w-5 text-muted-foreground" />
              <div>
                <CardTitle>Configuration</CardTitle>
                <CardDescription>
                  Non-sensitive settings for this connector
                </CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            {configFields.map((field) => (
              <FieldRenderer
                key={field.key}
                field={field}
                control={control}
                error={errors[field.key]?.message as string}
                disabled={disabled}
              />
            ))}
          </CardContent>
        </Card>
      )}

      {/* Secrets Section */}
      {secretFields.length > 0 && (
        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <Lock className="h-5 w-5 text-muted-foreground" />
              <div>
                <CardTitle>Secrets</CardTitle>
                <CardDescription>
                  Sensitive credentials (encrypted and never shown after entry)
                </CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Token Health Status */}
            {tokenHealthStatus && (
              <TokenHealthStatusDisplay
                healthStatus={tokenHealthStatus}
                expiresAt={tokenExpiresAt}
                lastRenewedAt={tokenLastRenewedAt}
              />
            )}

            {/* Secret Fields */}
            {secretFields.map((field) => (
              <FieldRenderer
                key={field.key}
                field={field}
                control={control}
                error={errors[field.key]?.message as string}
                maskedValue={maskedSecrets[field.key]}
                disabled={disabled}
              />
            ))}
          </CardContent>
        </Card>
      )}

      <div className="flex justify-end pt-4">
        <Button type="submit" disabled={loading || disabled}>
          {loading ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Saving...
            </>
          ) : (
            'Save Configuration'
          )}
        </Button>
      </div>
    </form>
  );
}
