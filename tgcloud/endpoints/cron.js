// Dipanggil terjadwal oleh GitHub Action (`tgcloud run endpoints/cron`); hanya untuk admin.
//   input: { dry?: boolean, shard?: number, of?: number }
import { api, EndpointError } from 'sdk';
import * as repo from '../lib/repo.js';
import config from '../lib/config.js';
import { runCron } from '../lib/cron.js';
import { runEndpoint } from '../lib/endpoint.js';

export default (input, ctx) => runEndpoint({
  EndpointError, repo, ctx, name: 'cron',
  fn: (uid) => runCron({ api, repo, config, uid, input }),
});
