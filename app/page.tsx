import { redirect } from 'next/navigation';

/**
 * Root page — the middleware enforces auth, so by the time we're here we
 * have a valid session cookie. Just route to the default landing page.
 */
export default function HomePage() {
  redirect('/agents');
}
