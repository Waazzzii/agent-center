'use client';

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { CreditCard } from 'lucide-react';

export default function BillingPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Billing</h1>
        <p className="text-muted-foreground">Manage your subscription and payment details</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Billing &amp; Subscription</CardTitle>
          <CardDescription>Manage your organization's billing and subscription details</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col items-center justify-center py-12 text-center">
            <CreditCard className="h-16 w-16 text-muted-foreground mb-4" />
            <h3 className="text-lg font-semibold mb-2">Billing Management</h3>
            <p className="text-sm text-muted-foreground max-w-md mb-6">
              Billing features are coming soon. You'll be able to view your subscription plan,
              payment methods, invoices, and usage-based billing details here.
            </p>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 w-full max-w-2xl">
              <div className="border rounded-lg p-4">
                <h4 className="font-medium mb-1">Current Plan</h4>
                <p className="text-xs text-muted-foreground">View and upgrade your subscription</p>
              </div>
              <div className="border rounded-lg p-4">
                <h4 className="font-medium mb-1">Payment Methods</h4>
                <p className="text-xs text-muted-foreground">Manage credit cards and billing info</p>
              </div>
              <div className="border rounded-lg p-4">
                <h4 className="font-medium mb-1">Invoices</h4>
                <p className="text-xs text-muted-foreground">Download past invoices and receipts</p>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
