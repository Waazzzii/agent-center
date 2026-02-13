'use client';

import { useState, KeyboardEvent } from 'react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { X, Plus } from 'lucide-react';

interface EndpointManagerProps {
  endpoints: string[];
  onChange: (endpoints: string[]) => void;
  placeholder?: string;
}

export function EndpointManager({ endpoints, onChange, placeholder = 'get_data' }: EndpointManagerProps) {
  const [inputValue, setInputValue] = useState('');

  const addEndpoint = () => {
    const trimmed = inputValue.trim();
    if (!trimmed) return;

    // MCP tool names - no "/" prefix needed
    const endpoint = trimmed;

    // Avoid duplicates
    if (endpoints.includes(endpoint)) {
      setInputValue('');
      return;
    }

    onChange([...endpoints, endpoint]);
    setInputValue('');
  };

  const removeEndpoint = (index: number) => {
    onChange(endpoints.filter((_, i) => i !== index));
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      addEndpoint();
    }
  };

  return (
    <div className="space-y-3">
      {/* Input field */}
      <div className="flex gap-2">
        <Input
          value={inputValue}
          onChange={(e) => setInputValue(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          className="flex-1"
        />
        <Button type="button" onClick={addEndpoint} size="sm" variant="outline">
          <Plus className="h-4 w-4 mr-1" />
          Add
        </Button>
      </div>

      {/* Endpoint tags */}
      {endpoints.length > 0 && (
        <div className="flex flex-wrap gap-2 p-3 border rounded-md bg-muted/30">
          {endpoints.map((endpoint, index) => (
            <Badge key={index} variant="secondary" className="pl-2 pr-1 py-1 text-sm">
              <code className="mr-2">{endpoint}</code>
              <button
                type="button"
                onClick={() => removeEndpoint(index)}
                className="ml-1 rounded-full hover:bg-muted-foreground/20 p-0.5"
              >
                <X className="h-3 w-3" />
              </button>
            </Badge>
          ))}
        </div>
      )}

      {endpoints.length === 0 && (
        <div className="p-6 border rounded-md border-dashed text-center text-sm text-muted-foreground">
          No endpoints added yet. Add endpoints above.
        </div>
      )}

      <p className="text-xs text-muted-foreground">
        Enter MCP tool names (e.g., get_reservations, get_property_list). Tool names should not include the "/" prefix.
      </p>
    </div>
  );
}
