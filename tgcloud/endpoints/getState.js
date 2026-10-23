// Mini App: seluruh state pengguna + hasil hitungan (fase, prediksi, analisis).
import { EndpointError } from 'sdk';
import * as repo from '../lib/repo.js';
import config from '../lib/config.js';
import { createService } from '../lib/service.js';
import { runEndpoint } from '../lib/endpoint.js';

const svc = createService({ repo, config });

export default (input, ctx) => runEndpoint({ EndpointError, repo, ctx, name: 'getState', fn: (uid) => svc.getState(uid) });
