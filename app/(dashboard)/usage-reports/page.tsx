'use client';

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { BarChart3 } from 'lucide-react';

export default function UsageReportsPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Usage Reports</h1>
        <p className="text-sm text-muted-foreground mt-1">Monitor API usage, connector activity, and user statistics</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Usage Reports &amp; Analytics</CardTitle>
          <CardDescription>Monitor API usage, connector activity, and user statistics</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col items-center justify-center py-12 text-center">
            <BarChart3 className="h-16 w-16 text-muted-foreground mb-4" />
            <h3 className="text-lg font-semibold mb-2">Usage Analytics</h3>
            <p className="text-sm text-muted-foreground max-w-md mb-6">
              Usage reporting features are coming soon. You'll be able to view detailed analytics
              on API calls, connector usage, active users, and data transfer metrics.
            </p>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 w-full max-w-4xl">
              <div className="border rounded-lg p-4">
                <h4 className="font-medium mb-1">API Calls</h4>
                <p className="text-xs text-muted-foreground">Total requests per period</p>
              </div>
              <div className="border rounded-lg p-4">
                <h4 className="font-medium mb-1">Active Users</h4>
                <p className="text-xs text-muted-foreground">Monthly and daily active users</p>
              </div>
              <div className="border rounded-lg p-4">
                <h4 className="font-medium mb-1">Connector Usage</h4>
                <p className="text-xs text-muted-foreground">Usage by connector type</p>
              </div>
              <div className="border rounded-lg p-4">
                <h4 className="font-medium mb-1">Data Transfer</h4>
                <p className="text-xs text-muted-foreground">Bandwidth and storage metrics</p>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}