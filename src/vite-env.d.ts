/// <reference types="vite/client" />

type LudaEvent = (data: unknown) => void;

interface LudaBridge {
  platform: string;
  invoke: (channel: string, payload?: unknown) => Promise<any>;
  on: (channel: string, handler: LudaEvent) => () => void;
}

interface Window {
  luda: LudaBridge;
}
