import { handleConnect } from '@/server/connect-app/service';
import { getDb } from '@/server/db';
import { getEnv } from '@/server/env';

/**
 * Connect App protocol endpoint (same URL as EMS 4.x: /connect). Paired apps
 * send signed envelopes here; GET returns this installation's public identity.
 */
async function handle(request: Request) {
  return handleConnect(request, await getDb(), await getEnv());
}

export { handle as GET, handle as POST, handle as OPTIONS };
