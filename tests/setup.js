// Mock Chrome extension APIs for testing
import { vi } from 'vitest';

// Mock chrome.storage.local
const mockStorage = new Map();

globalThis.chrome = {
  storage: {
    local: {
      get: vi.fn((keys) => {
        if (typeof keys === 'string') {
          return Promise.resolve({ [keys]: mockStorage.get(keys) });
        }
        if (Array.isArray(keys)) {
          const result = {};
          for (const key of keys) {
            result[key] = mockStorage.get(key);
          }
          return Promise.resolve(result);
        }
        return Promise.resolve({});
      }),
      set: vi.fn((data) => {
        for (const [key, value] of Object.entries(data)) {
          mockStorage.set(key, value);
        }
        return Promise.resolve();
      }),
    },
  },
  runtime: {
    sendMessage: vi.fn(),
    onMessage: {
      addListener: vi.fn(),
    },
    onInstalled: {
      addListener: vi.fn(),
    },
  },
};

// Reset mocks between tests
beforeEach(() => {
  mockStorage.clear();
  vi.clearAllMocks();
});
