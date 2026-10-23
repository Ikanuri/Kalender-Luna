// Mini App: satu pintu semua aksi tulis ({ type: 'symptom' | 'bbt' | ... }); mengembalikan state terbaru.
import { EndpointError } from 'sdk';
import * as repo from '../lib/repo.js';
import config from '../lib/config.js';
import { createService } from '../lib/service.js';
import { runEndpoint } from '../lib/endpoint.js';

const svc = createService({ repo, config });

export default (input, ctx) => runEndpoint({ EndpointError, repo, ctx, name: 'act', fn: (uid) => svc.act(uid, input) });
