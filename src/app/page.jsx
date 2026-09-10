import { authConfigured, currentUser } from "@/auth";
import { Builder } from "@/editor/builder";

/* Rendered per request, always.
 *
 * Whether this page reads a cookie depends on whether sign-in is configured,
 * and `currentUser` short-circuits before touching one when it is not — so a
 * build run without `AUTH_SECRET` in its environment prerenders this route as
 * a static file with no account in it, and setting the secret at runtime never
 * un-does that. The account then never appears, on a deployment that is
 * signing people in perfectly well. Saying it plainly here costs a render and
 * removes a difference between two deployments that should not differ. */
export const dynamic = "force-dynamic";

/* The builder is the site. There is no landing page and no marketing route:
   somebody arriving here came to draw a message, and a page in front of that
   is a page between them and the thing they came for. */
export default async function Home() {
  return <Builder user={await currentUser()} canSignIn={authConfigured} />;
}
