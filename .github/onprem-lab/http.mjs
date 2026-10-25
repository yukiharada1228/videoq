import {Agent, fetch} from 'undici';

const timeout = 600_000;
const dispatcher = new Agent({headersTimeout: timeout, bodyTimeout: timeout});

// CPU chat can outlast Node fetch's five-minute header deadline. Keep the
// transport and overall request budget aligned with the CPU application profile.
export function labFetch(url, options = {}) {
  return fetch(url, {...options, dispatcher, signal: options.signal ?? AbortSignal.timeout(timeout)});
}

export const closeLabHttp = () => dispatcher.close();
