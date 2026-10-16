import { defineCloudflareConfig } from '@opennextjs/cloudflare';

// No incremental cache is configured: every EMS page that reads data is
// dynamic and private, so there is nothing safe to cache across tenants.
export default defineCloudflareConfig({});
