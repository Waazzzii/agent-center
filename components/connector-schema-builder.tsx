'use client';

import { useState } from 'react';
import {
  ConnectorConfigSchema,
  ConnectorSchemaField,
  FieldType,
} from '@/types/api.types';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Plus, Trash2, ChevronUp, ChevronDown, Eye } from 'lucide-react';
import { DynamicConnectorForm } from './dynamic-connector-form';
import { toast } from 'sonner';

interface SchemaBuilderProps {
  initialSchema?: ConnectorConfigSchema;
  onChange: (schema: ConnectorConfigSchema) => void;
}

const FIELD_TYPES: { value: FieldType; label: string }[] = [
  { value: 'text', label: 'Text' },
  { value: 'textarea', label: 'Text Area' },
  { value: 'number', label: 'Number' },
  { value: 'boolean', label: 'Boolean (Switch)' },
  { value: 'select', label: 'Select (Dropdown)' },
  { value: 'url', label: 'URL' },
  { value: 'email', label: 'Email' },
  { value: 'password', label: 'Password' },
  { value: 'oauth', label: 'OAuth Login' },
];

export function ConnectorSchemaBuilder({ initialSchema, onChange }: SchemaBuilderProps) {
  const [schema, setSchema] = useState<ConnectorConfigSchema>(
    initialSchema || { fields: [] }
  );
  const [selectedFieldIndex, setSelectedFieldIndex] = useState<number | null>(null);
  const [showPreview, setShowPreview] = useState(false);
  // Track which fields have had their keys manually edited
  const [manuallyEditedKeys, setManuallyEditedKeys] = useState<Set<number>>(new Set());

  const updateSchema = (newSchema: ConnectorConfigSchema) => {
    setSchema(newSchema);
    onChange(newSchema);
  };

  // Convert label to snake_case key
  const labelToKey = (label: string): string => {
    return label
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '_') // Replace non-alphanumeric with underscore
      .replace(/^_+|_+$/g, '');     // Remove leading/trailing underscores
  };

  const addField = () => {
    const newField: ConnectorSchemaField = {
      key: 'new_field',
      label: 'New Field',
      type: 'text',
      required: false,
    };

    const newSchema = {
      ...schema,
      fields: [...schema.fields, newField],
    };
    updateSchema(newSchema);
    setSelectedFieldIndex(newSchema.fields.length - 1);
  };

  const removeField = (index: number) => {
    const newFields = schema.fields.filter((_, i) => i !== index);
    updateSchema({ ...schema, fields: newFields });
    if (selectedFieldIndex === index) {
      setSelectedFieldIndex(null);
    } else if (selectedFieldIndex !== null && selectedFieldIndex > index) {
      setSelectedFieldIndex(selectedFieldIndex - 1);
    }
  };

  const moveField = (index: number, direction: 'up' | 'down') => {
    if (
      (direction === 'up' && index === 0) ||
      (direction === 'down' && index === schema.fields.length - 1)
    ) {
      return;
    }

    const newFields = [...schema.fields];
    const targetIndex = direction === 'up' ? index - 1 : index + 1;
    [newFields[index], newFields[targetIndex]] = [newFields[targetIndex], newFields[index]];

    updateSchema({ ...schema, fields: newFields });
    setSelectedFieldIndex(targetIndex);
  };

  const updateField = (index: number, updates: Partial<ConnectorSchemaField>) => {
    const newFields = [...schema.fields];
    newFields[index] = { ...newFields[index], ...updates };
    updateSchema({ ...schema, fields: newFields });
  };

  const addOption = (fieldIndex: number) => {
    const field = schema.fields[fieldIndex];
    const newOption = {
      value: `option_${Date.now()}`,
      label: 'New Option',
    };
    updateField(fieldIndex, {
      options: [...(field.options || []), newOption],
    });
  };

  const updateOption = (
    fieldIndex: number,
    optionIndex: number,
    updates: { value?: string; label?: string }
  ) => {
    const field = schema.fields[fieldIndex];
    const newOptions = [...(field.options || [])];
    newOptions[optionIndex] = { ...newOptions[optionIndex], ...updates };
    updateField(fieldIndex, { options: newOptions });
  };

  const removeOption = (fieldIndex: number, optionIndex: number) => {
    const field = schema.fields[fieldIndex];
    const newOptions = (field.options || []).filter((_, i) => i !== optionIndex);
    updateField(fieldIndex, { options: newOptions });
  };

  const selectedField = selectedFieldIndex !== null ? schema.fields[selectedFieldIndex] : null;

  return (
    <div className="space-y-6">
      <Tabs defaultValue="builder" className="w-full">
        <TabsList>
          <TabsTrigger value="builder">Builder</TabsTrigger>
          <TabsTrigger value="preview">
            <Eye className="h-4 w-4 mr-2" />
            Preview
          </TabsTrigger>
          <TabsTrigger value="json">JSON</TabsTrigger>
        </TabsList>

        <TabsContent value="builder" className="space-y-4">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {/* Field List */}
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle>Fields</CardTitle>
                    <CardDescription>
                      {schema.fields.length} field{schema.fields.length !== 1 ? 's' : ''}
                    </CardDescription>
                  </div>
                  <Button type="button" onClick={addField} size="sm">
                    <Plus className="h-4 w-4 mr-2" />
                    Add Field
                  </Button>
                </div>
              </CardHeader>
              <CardContent>
                {schema.fields.length === 0 ? (
                  <p className="text-sm text-muted-foreground text-center py-8">
                    No fields yet. Click "Add Field" to get started.
                  </p>
                ) : (
                  <div className="space-y-2">
                    {schema.fields.map((field, index) => (
                      <div
                        key={field.key}
                        className={`p-3 border rounded-md cursor-pointer transition-colors ${
                          selectedFieldIndex === index
                            ? 'border-primary bg-primary/5'
                            : 'hover:bg-muted/50'
                        }`}
                        onClick={() => setSelectedFieldIndex(index)}
                      >
                        <div className="flex items-center justify-between">
                          <div className="flex-1">
                            <div className="font-medium">{field.label}</div>
                            <div className="text-sm text-muted-foreground">
                              {field.key} • {field.type}
                              {field.required && ' • Required'}
                              {field.secret && ' • Secret'}
                            </div>
                          </div>
                          <div className="flex items-center gap-1">
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              onClick={(e) => {
                                e.stopPropagation();
                                moveField(index, 'up');
                              }}
                              disabled={index === 0}
                            >
                              <ChevronUp className="h-4 w-4" />
                            </Button>
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              onClick={(e) => {
                                e.stopPropagation();
                                moveField(index, 'down');
                              }}
                              disabled={index === schema.fields.length - 1}
                            >
                              <ChevronDown className="h-4 w-4" />
                            </Button>
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              onClick={(e) => {
                                e.stopPropagation();
                                removeField(index);
                              }}
                            >
                              <Trash2 className="h-4 w-4 text-destructive" />
                            </Button>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Field Editor */}
            <Card>
              <CardHeader>
                <CardTitle>Field Editor</CardTitle>
                <CardDescription>
                  {selectedField ? `Editing: ${selectedField.label}` : 'Select a field to edit'}
                </CardDescription>
              </CardHeader>
              <CardContent>
                {selectedField && selectedFieldIndex !== null ? (
                  <div className="space-y-4">
                    {/* Field Label */}
                    <div className="space-y-2">
                      <Label htmlFor="field-label">Label</Label>
                      <Input
                        id="field-label"
                        value={selectedField.label}
                        onChange={(e) => {
                          const newLabel = e.target.value;
                          // Auto-generate key from label if key hasn't been manually edited
                          if (!manuallyEditedKeys.has(selectedFieldIndex)) {
                            const autoKey = labelToKey(newLabel);
                            updateField(selectedFieldIndex, { label: newLabel, key: autoKey });
                          } else {
                            updateField(selectedFieldIndex, { label: newLabel });
                          }
                        }}
                        placeholder="e.g., API Key"
                      />
                      <p className="text-xs text-muted-foreground">
                        Display name shown to users
                      </p>
                    </div>

                    {/* Field Key */}
                    <div className="space-y-2">
                      <Label htmlFor="field-key">Field Key</Label>
                      <Input
                        id="field-key"
                        value={selectedField.key}
                        onChange={(e) => {
                          updateField(selectedFieldIndex, { key: e.target.value });
                          // Mark this field's key as manually edited
                          setManuallyEditedKeys(prev => new Set(prev).add(selectedFieldIndex));
                        }}
                        placeholder="e.g., api_key"
                      />
                      <p className="text-xs text-muted-foreground">
                        Unique identifier (auto-generated from label, or edit manually)
                      </p>
                    </div>

                    {/* Field Type */}
                    <div className="space-y-2">
                      <Label htmlFor="field-type">Type</Label>
                      <Select
                        value={selectedField.type}
                        onValueChange={(value: FieldType) => {
                          if (selectedField.secret && value !== 'text') {
                            toast.error('Secret fields can only be of type "Text"');
                            return;
                          }
                          updateField(selectedFieldIndex, { type: value });
                        }}
                      >
                        <SelectTrigger id="field-type">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {FIELD_TYPES.map((type) => (
                            <SelectItem key={type.value} value={type.value}>
                              {type.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>

                    {/* OAuth Provider — only when type === oauth */}
                    {selectedField.type === 'oauth' && (
                      <div className="space-y-2">
                        <Label htmlFor="field-provider">OAuth Provider</Label>
                        <Select
                          value={selectedField.provider ?? 'google'}
                          onValueChange={(value) =>
                            updateField(selectedFieldIndex, { provider: value as 'google' })
                          }
                        >
                          <SelectTrigger id="field-provider">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="google">Google</SelectItem>
                          </SelectContent>
                        </Select>
                        <p className="text-xs text-muted-foreground">
                          Renders an OAuth connect/disconnect button instead of a text input.
                        </p>
                      </div>
                    )}

                    {/* Required — not applicable for oauth */}
                    {selectedField.type !== 'oauth' && (
                    <div className="flex items-center space-x-2">
                      <Switch
                        id="field-required"
                        checked={selectedField.required || false}
                        onCheckedChange={(checked) =>
                          updateField(selectedFieldIndex, { required: checked })
                        }
                      />
                      <Label htmlFor="field-required" className="cursor-pointer">
                        Required field
                      </Label>
                    </div>
                    )}

                    {/* Secret — not applicable for oauth */}
                    {selectedField.type !== 'oauth' && (
                    <div className="flex items-center space-x-2">
                      <Switch
                        id="field-secret"
                        checked={selectedField.secret || false}
                        onCheckedChange={(checked) => {
                          if (checked && selectedField.type !== 'text') {
                            toast.error('Only "Text" type fields can be marked as secret');
                            return;
                          }
                          updateField(selectedFieldIndex, { secret: checked });
                        }}
                      />
                      <Label htmlFor="field-secret" className="cursor-pointer">
                        Secret field (hidden after entry)
                      </Label>
                    </div>
                    )}

                    {/* Placeholder — not applicable for oauth */}
                    {selectedField.type !== 'oauth' && (
                    <div className="space-y-2">
                      <Label htmlFor="field-placeholder">Placeholder</Label>
                      <Input
                        id="field-placeholder"
                        value={selectedField.placeholder || ''}
                        onChange={(e) =>
                          updateField(selectedFieldIndex, { placeholder: e.target.value })
                        }
                        placeholder="e.g., Enter your API key"
                      />
                    </div>
                    )}

                    {/* Help Text */}
                    <div className="space-y-2">
                      <Label htmlFor="field-help">Help Text</Label>
                      <Textarea
                        id="field-help"
                        value={selectedField.helpText || ''}
                        onChange={(e) =>
                          updateField(selectedFieldIndex, { helpText: e.target.value })
                        }
                        placeholder="Additional information to help users fill this field"
                        rows={2}
                      />
                    </div>

                    {/* Default Value */}
                    {selectedField.type !== 'boolean' && selectedField.type !== 'oauth' && (
                      <div className="space-y-2">
                        <Label htmlFor="field-default">Default Value</Label>
                        <Input
                          id="field-default"
                          value={selectedField.default?.toString() || ''}
                          onChange={(e) => {
                            const value =
                              selectedField.type === 'number'
                                ? Number(e.target.value)
                                : e.target.value;
                            updateField(selectedFieldIndex, { default: value });
                          }}
                          type={selectedField.type === 'number' ? 'number' : 'text'}
                          placeholder="Optional default value"
                        />
                      </div>
                    )}

                    {/* Boolean Default */}
                    {selectedField.type === 'boolean' && (
                      <div className="flex items-center space-x-2">
                        <Switch
                          id="field-default-bool"
                          checked={selectedField.default as boolean || false}
                          onCheckedChange={(checked) =>
                            updateField(selectedFieldIndex, { default: checked })
                          }
                        />
                        <Label htmlFor="field-default-bool" className="cursor-pointer">
                          Default to enabled
                        </Label>
                      </div>
                    )}

                    {/* Options for Select */}
                    {selectedField.type === 'select' && (
                      <div className="space-y-2">
                        <div className="flex items-center justify-between">
                          <Label>Options</Label>
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            onClick={() => addOption(selectedFieldIndex)}
                          >
                            <Plus className="h-3 w-3 mr-1" />
                            Add Option
                          </Button>
                        </div>
                        <div className="space-y-2">
                          {(selectedField.options || []).map((option, optionIndex) => (
                            <div key={optionIndex} className="flex gap-2">
                              <Input
                                value={option.value}
                                onChange={(e) =>
                                  updateOption(selectedFieldIndex, optionIndex, {
                                    value: e.target.value,
                                  })
                                }
                                placeholder="Value"
                                className="flex-1"
                              />
                              <Input
                                value={option.label}
                                onChange={(e) =>
                                  updateOption(selectedFieldIndex, optionIndex, {
                                    label: e.target.value,
                                  })
                                }
                                placeholder="Label"
                                className="flex-1"
                              />
                              <Button
                                type="button"
                                size="sm"
                                variant="ghost"
                                onClick={() => removeOption(selectedFieldIndex, optionIndex)}
                              >
                                <Trash2 className="h-4 w-4 text-destructive" />
                              </Button>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Validation Rules */}
                    {(selectedField.type === 'text' ||
                      selectedField.type === 'textarea' ||
                      selectedField.type === 'number') && (
                      <div className="space-y-2 pt-4 border-t">
                        <Label className="text-base">Validation Rules</Label>

                        <div className="grid grid-cols-2 gap-2">
                          <div className="space-y-2">
                            <Label htmlFor="field-min">
                              {selectedField.type === 'number' ? 'Min Value' : 'Min Length'}
                            </Label>
                            <Input
                              id="field-min"
                              type="number"
                              value={selectedField.validation?.min ?? ''}
                              onChange={(e) =>
                                updateField(selectedFieldIndex, {
                                  validation: {
                                    ...selectedField.validation,
                                    min: e.target.value ? Number(e.target.value) : undefined,
                                  },
                                })
                              }
                              placeholder="Optional"
                            />
                          </div>

                          <div className="space-y-2">
                            <Label htmlFor="field-max">
                              {selectedField.type === 'number' ? 'Max Value' : 'Max Length'}
                            </Label>
                            <Input
                              id="field-max"
                              type="number"
                              value={selectedField.validation?.max ?? ''}
                              onChange={(e) =>
                                updateField(selectedFieldIndex, {
                                  validation: {
                                    ...selectedField.validation,
                                    max: e.target.value ? Number(e.target.value) : undefined,
                                  },
                                })
                              }
                              placeholder="Optional"
                            />
                          </div>
                        </div>

                        {selectedField.type !== 'number' && (
                          <>
                            <div className="space-y-2">
                              <Label htmlFor="field-pattern">Regex Pattern</Label>
                              <Input
                                id="field-pattern"
                                value={selectedField.validation?.pattern || ''}
                                onChange={(e) =>
                                  updateField(selectedFieldIndex, {
                                    validation: {
                                      ...selectedField.validation,
                                      pattern: e.target.value,
                                    },
                                  })
                                }
                                placeholder="e.g., ^[A-Z0-9]+$"
                              />
                            </div>

                            <div className="space-y-2">
                              <Label htmlFor="field-custom-message">
                                Custom Validation Message
                              </Label>
                              <Input
                                id="field-custom-message"
                                value={selectedField.validation?.customMessage || ''}
                                onChange={(e) =>
                                  updateField(selectedFieldIndex, {
                                    validation: {
                                      ...selectedField.validation,
                                      customMessage: e.target.value,
                                    },
                                  })
                                }
                                placeholder="Optional custom error message"
                              />
                            </div>
                          </>
                        )}
                      </div>
                    )}
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground text-center py-8">
                    Select a field from the list to edit its properties
                  </p>
                )}
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="preview">
          <Card>
            <CardHeader>
              <CardTitle>Form Preview</CardTitle>
              <CardDescription>
                This is how the form will appear to organization admins
              </CardDescription>
            </CardHeader>
            <CardContent>
              {schema.fields.length > 0 ? (
                <DynamicConnectorForm
                  schema={schema}
                  initialValues={{}}
                  existingSecrets={[]}
                  onSubmit={async () => {
                    // Preview only - no actual submission
                  }}
                  loading={false}
                />
              ) : (
                <p className="text-sm text-muted-foreground text-center py-8">
                  No fields to preview. Add fields to see the generated form.
                </p>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="json">
          <Card>
            <CardHeader>
              <CardTitle>JSON Schema</CardTitle>
              <CardDescription>View or edit the raw JSON schema</CardDescription>
            </CardHeader>
            <CardContent>
              <Textarea
                value={JSON.stringify(schema, null, 2)}
                onChange={(e) => {
                  try {
                    const parsed = JSON.parse(e.target.value);
                    updateSchema(parsed);
                  } catch (error) {
                    // Invalid JSON, don't update
                  }
                }}
                rows={20}
                className="font-mono text-sm"
              />
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
