import { redirect } from 'next/navigation';

/** Authorization lands on its first area, Access Groups. */
export default function AuthorizationIndex() {
  redirect('/authorization/groups');
}
