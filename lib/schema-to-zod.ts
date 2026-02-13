import { z } from 'zod';
import type { ConnectorConfigSchema, ConnectorSchemaField } from '@/types/api.types';

/**
 * Converts a ConnectorConfigSchema to a Zod validation schema
 * @param schema The connector configuration schema
 * @returns A Zod object schema for validation
 */
export function schemaToZod(schema: ConnectorConfigSchema): z.ZodObject<any> {
  const shape: Record<string, z.ZodTypeAny> = {};

  schema.fields.forEach(field => {
    let fieldSchema: z.ZodTypeAny;

    // Build base schema based on type
    switch (field.type) {
      case 'text':
      case 'textarea':
      case 'password':
        fieldSchema = z.string();

        // If required AND NOT a secret, don't allow empty strings
        // Secrets are handled separately in form logic
        if (field.required && !field.secret) {
          fieldSchema = (fieldSchema as z.ZodString).min(1, `${field.label} is required`);
        }

        if (field.validation?.min !== undefined) {
          fieldSchema = (fieldSchema as z.ZodString).min(
            field.validation.min,
            field.validation.customMessage || `Minimum length is ${field.validation.min}`
          );
        }
        if (field.validation?.max !== undefined) {
          fieldSchema = (fieldSchema as z.ZodString).max(
            field.validation.max,
            field.validation.customMessage || `Maximum length is ${field.validation.max}`
          );
        }
        if (field.validation?.pattern) {
          fieldSchema = (fieldSchema as z.ZodString).regex(
            new RegExp(field.validation.pattern),
            field.validation.customMessage || 'Invalid format'
          );
        }
        break;

      case 'url':
        fieldSchema = z.string().url('Invalid URL');
        if (field.required) {
          fieldSchema = (fieldSchema as z.ZodString).min(1, `${field.label} is required`);
        }
        break;

      case 'email':
        fieldSchema = z.string().email('Invalid email');
        if (field.required) {
          fieldSchema = (fieldSchema as z.ZodString).min(1, `${field.label} is required`);
        }
        break;

      case 'number':
        fieldSchema = z.number();
        if (field.validation?.min !== undefined) {
          fieldSchema = (fieldSchema as z.ZodNumber).min(
            field.validation.min,
            field.validation.customMessage || `Minimum value is ${field.validation.min}`
          );
        }
        if (field.validation?.max !== undefined) {
          fieldSchema = (fieldSchema as z.ZodNumber).max(
            field.validation.max,
            field.validation.customMessage || `Maximum value is ${field.validation.max}`
          );
        }
        break;

      case 'boolean':
        fieldSchema = z.boolean();
        break;

      case 'select':
        if (field.options && field.options.length > 0) {
          const values = field.options.map(o => o.value) as [string, ...string[]];
          fieldSchema = z.enum(values);
        } else {
          fieldSchema = z.string();
        }
        break;

      default:
        fieldSchema = z.string();
    }

    // Make optional if not required OR if it's a secret field
    // (secrets are handled manually in form logic)
    if (!field.required || field.secret || field.type === 'password') {
      fieldSchema = fieldSchema.optional();
    }

    shape[field.key] = fieldSchema;
  });

  return z.object(shape);
}
