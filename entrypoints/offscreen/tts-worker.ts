import { createTtsHost } from '../../lib/tts/local/host';
import type { WorkerCommand } from '../../lib/tts/worker-protocol';

// Inference runs off the offscreen document's main thread, so audio
// scheduling never waits on a model.
const handle = createTtsHost((event, transfer = []) => self.postMessage(event, { transfer }));
self.onmessage = (event: MessageEvent<WorkerCommand>) => handle(event.data);
