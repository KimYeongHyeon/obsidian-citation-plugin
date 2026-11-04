jest.mock('promise-worker', () => ({
  default: jest.requireActual('promise-worker'),
}));

jest.mock('obsidian', () => ({ Notice: class {} }), { virtual: true });

import { WorkerManager } from '../util';

class FakeWorker {
  listeners: Record<string, Array<(event: any) => void>> = {};
  addEventListener(type: string, listener: (event: any) => void): void {
    (this.listeners[type] ||= []).push(listener);
  }
  removeEventListener(type: string, listener: (event: any) => void): void {
    this.listeners[type] = this.listeners[type].filter((fn) => fn !== listener);
  }
  postMessage = jest.fn();
  terminate = jest.fn();
  emit(type: string, event = {}): void {
    this.listeners[type]?.forEach((listener) => listener(event));
  }
}

test('worker error and termination reject pending work and release the channel', async () => {
  const worker = new FakeWorker();
  const manager = new WorkerManager((worker as unknown) as Worker, {
    blockingChannel: true,
  });
  const first = manager.post('first');
  worker.emit('error');
  await expect(first).rejects.toThrow('worker failed');
  expect(manager.blocked).toBe(false);
  await expect(manager.post('second')).rejects.toThrow('terminated');

  const otherWorker = new FakeWorker();
  const other = new WorkerManager((otherWorker as unknown) as Worker, {
    blockingChannel: true,
  });
  const second = other.post('second');
  other.terminate();
  await expect(second).rejects.toThrow('worker terminated');
  expect(otherWorker.terminate).toHaveBeenCalledTimes(1);
  await expect(other.post('third')).rejects.toThrow('terminated');
});
