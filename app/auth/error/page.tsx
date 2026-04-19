import Link from "next/link";

export default async function AuthErrorPage({
  searchParams,
}: {
  searchParams: Promise<{ message?: string }>;
}) {
  const { message } = await searchParams;
  const errorMessage = message
    ? decodeURIComponent(message)
    : "An authentication error occurred.";

  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-4">
      <div className="w-full max-w-md rounded-lg border border-destructive bg-destructive/10 p-8 text-center shadow-sm">
        <h2 className="mb-2 text-xl font-semibold text-destructive">Authentication Error</h2>
        <p className="mb-6 text-sm text-muted-foreground">{errorMessage}</p>
        <Link href="/auth/login" className="text-sm text-primary underline hover:no-underline">
          Return to login
        </Link>
      </div>
    </div>
  );
}
