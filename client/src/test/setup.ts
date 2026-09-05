import '@testing-library/jest-dom/vitest';
import { vi } from 'vitest';

class ResizeObserverMock {
  observe() {}
  disconnect() {}
}

vi.stubGlobal('ResizeObserver', ResizeObserverMock);
HTMLCanvasElement.prototype.getContext = vi.fn(() => null);
