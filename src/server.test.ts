import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('fastify', () => {
  const mockApp = {
    register: vi.fn().mockResolvedValue(undefined),
    log: { error: vi.fn() },
    setErrorHandler: vi.fn(),
    setNotFoundHandler: vi.fn(),
    listen: vi.fn().mockResolvedValue(undefined),
    close: vi.fn().mockResolvedValue(undefined),
  };
  return {
    default: vi.fn(() => mockApp),
    __mockApp: mockApp,
  };
});

vi.mock('@fastify/cors', () => ({
  default: vi.fn(),
}));

vi.mock('./lib/db/client.js', () => ({
  prisma: {
    $disconnect: vi.fn().mockResolvedValue(undefined),
  },
}));

vi.mock('./routes/index.js', () => ({
  registerRoutes: vi.fn(),
}));

vi.mock('./workers/agent-worker.js', () => ({
  startAgentWorker: vi.fn(),
}));

import Fastify, { __mockApp } from 'fastify';
import { prisma } from './lib/db/client.js';
import { registerRoutes } from './routes/index.js';
import { startAgentWorker } from './workers/agent-worker.js';

describe('main', () => {
  let originalProcessOn: typeof process.on;
  let originalProcessExit: typeof process.exit;
  let originalEnv: NodeJS.ProcessEnv;

  beforeEach(() => {
    originalProcessOn = process.on;
    originalProcessExit = process.exit;
    originalEnv = process.env;

    process.on = vi.fn() as any;
    process.exit = vi.fn() as any;
    process.env = { ...originalEnv };

    vi.spyOn(console, 'log').mockImplementation(vi.fn());
    vi.spyOn(console, 'error').mockImplementation(vi.fn());
  });

  afterEach(() => {
    process.on = originalProcessOn;
    process.exit = originalProcessExit;
    process.env = originalEnv;

    vi.restoreAllMocks();
    vi.clearAllMocks();
  });

  it('should create a Fastify app with logging enabled', async () => {
    process.env.PORT = '3001';
    process.env.NODE_ENV = 'development';

    vi.resetModules();
    await import('./server.js');

    expect(Fastify).toHaveBeenCalledWith({ logger: true });
  });

  it('should register CORS with origin true', async () => {
    process.env.PORT = '3001';
    process.env.NODE_ENV = 'development';

    vi.resetModules();
    await import('./server.js');

    expect(__mockApp.register).toHaveBeenCalledWith(expect.anything(), { origin: true });
  });

  it('should register error handler', async () => {
    process.env.PORT = '3001';
    process.env.NODE_ENV = 'development';

    vi.resetModules();
    await import('./server.js');

    expect(__mockApp.setErrorHandler).toHaveBeenCalled();
  });

  it('should register not found handler', async () => {
    process.env.PORT = '3001';
    process.env.NODE_ENV = 'development';

    vi.resetModules();
    await import('./server.js');

    expect(__mockApp.setNotFoundHandler).toHaveBeenCalled();
  });

  it('should call registerRoutes with the app instance', async () => {
    process.env.PORT = '3001';
    process.env.NODE_ENV = 'development';

    vi.resetModules();
    await import('./server.js');

    expect(registerRoutes).toHaveBeenCalledWith(__mockApp);
  });

  it('should listen on correct port and host for development', async () => {
    delete process.env.PORT;
    process.env.NODE_ENV = 'development';

    vi.resetModules();
    await import('./server.js');

    expect(__mockApp.listen).toHaveBeenCalledWith({ port: 3001, host: '127.0.0.1' });
  });

  it('should listen on correct port and host for production', async () => {
    delete process.env.PORT;
    process.env.NODE_ENV = 'production';

    vi.resetModules();
    await import('./server.js');

    expect(__mockApp.listen).toHaveBeenCalledWith({ port: 3001, host: '0.0.0.0' });
  });

  it('should use PORT environment variable when provided', async () => {
    process.env.PORT = '8080';
    process.env.NODE_ENV = 'development';

    vi.resetModules();
    await import('./server.js');

    expect(__mockApp.listen).toHaveBeenCalledWith({ port: 8080, host: '127.0.0.1' });
  });

  it('should default to port 3001 if PORT env var is not set', async () => {
    delete process.env.PORT;
    process.env.NODE_ENV = 'development';

    vi.resetModules();
    await import('./server.js');

    expect(__mockApp.listen).toHaveBeenCalledWith({ port: 3001, host: '127.0.0.1' });
  });

  it('should call startAgentWorker after successful listen', async () => {
    process.env.PORT = '3001';
    process.env.NODE_ENV = 'development';

    vi.resetModules();
    await import('./server.js');

    expect(startAgentWorker).toHaveBeenCalled();
  });

  it('should log startup messages after successful listen', async () => {
    process.env.PORT = '3001';
    process.env.NODE_ENV = 'development';

    vi.resetModules();
    await import('./server.js');

    expect(console.log).toHaveBeenCalledWith('\nFindX API server → http://127.0.0.1:3001');
    expect(console.log).toHaveBeenCalledWith('Agent pipeline worker started');
  });

  it('should log startup messages with production host', async () => {
    process.env.PORT = '3001';
    process.env.NODE_ENV = 'production';

    vi.resetModules();
    await import('./server.js');

    expect(console.log).toHaveBeenCalledWith('\nFindX API server → http://0.0.0.0:3001');
  });

  it('should log error and exit with code 1 when listen fails', async () => {
    process.env.PORT = '3001';
    process.env.NODE_ENV = 'development';

    const listenError = new Error('Listen failed');
    __mockApp.listen.mockRejectedValueOnce(listenError);

    vi.resetModules();
    await import('./server.js');

    expect(__mockApp.log.error).toHaveBeenCalledWith(listenError);
    expect(process.exit).toHaveBeenCalledWith(1);
  });

  it('should register SIGINT handler', async () => {
    process.env.PORT = '3001';
    process.env.NODE_ENV = 'development';

    vi.resetModules();
    await import('./server.js');

    const sigintCalls = (process.on as any).mock.calls.filter((c: any[]) => c[0] === 'SIGINT');
    expect(sigintCalls.length).toBeGreaterThanOrEqual(1);
    expect(typeof sigintCalls[0][1]).toBe('function');
  });

  it('should register SIGTERM handler', async () => {
    process.env.PORT = '3001';
    process.env.NODE_ENV = 'development';

    vi.resetModules();
    await import('./server.js');

    const sigtermCalls = (process.on as any).mock.calls.filter((c: any[]) => c[0] === 'SIGTERM');
    expect(sigtermCalls.length).toBeGreaterThanOrEqual(1);
    expect(typeof sigtermCalls[0][1]).toBe('function');
  });

  it('should close app and disconnect prisma on SIGINT', async () => {
    process.env.PORT = '3001';
    process.env.NODE_ENV = 'development';

    vi.resetModules();
    await import('./server.js');

    const sigintHandler = (process.on as any).mock.calls.find((c: any[]) => c[0] === 'SIGINT')?.[1];
    expect(sigintHandler).toBeDefined();

    await sigintHandler();

    expect(console.log).toHaveBeenCalledWith('Received SIGINT, shutting down...');
    expect(__mockApp.close).toHaveBeenCalled();
    expect(prisma.$disconnect).toHaveBeenCalled();
    expect(process.exit).toHaveBeenCalledWith(0);
  });

  it('should close app and disconnect prisma on SIGTERM', async () => {
    process.env.PORT = '3001';
    process.env.NODE_ENV = 'development';

    vi.resetModules();
    await import('./server.js');

    const sigtermHandler = (process.on as any).mock.calls.find((c: any[]) => c[0] === 'SIGTERM')?.[1];
    expect(sigtermHandler).toBeDefined();

    await sigtermHandler();

    expect(console.log).toHaveBeenCalledWith('Received SIGTERM, shutting down...');
    expect(__mockApp.close).toHaveBeenCalled();
    expect(prisma.$disconnect).toHaveBeenCalled();
    expect(process.exit).toHaveBeenCalledWith(0);
  });

  describe('error handler', () => {
    it('should reply with 500 and generic message for server errors', async () => {
      process.env.PORT = '3001';
      process.env.NODE_ENV = 'development';

      vi.resetModules();
      await import('./server.js');

      const errorHandler = (__mockApp.setErrorHandler as any).mock.calls[0][0];

      const mockReply = {
        status: vi.fn().mockReturnThis(),
        send: vi.fn(),
      };

      const error = { statusCode: 500, message: 'Database exploded' };
      errorHandler(error, {}, mockReply);

      expect(mockReply.status).toHaveBeenCalledWith(500);
      expect(mockReply.send).toHaveBeenCalledWith({
        error: 'Internal Server Error',
        statusCode: 500,
      });
      expect(__mockApp.log.error).toHaveBeenCalledWith(error);
    });

    it('should reply with actual message for 4xx client errors', async () => {
      process.env.PORT = '3001';
      process.env.NODE_ENV = 'development';

      vi.resetModules();
      await import('./server.js');

      const errorHandler = (__mockApp.setErrorHandler as any).mock.calls[0][0];

      const mockReply = {
        status: vi.fn().mockReturnThis(),
        send: vi.fn(),
      };

      const error = { statusCode: 400, message: 'Bad Request: missing field' };
      errorHandler(error, {}, mockReply);

      expect(mockReply.status).toHaveBeenCalledWith(400);
      expect(mockReply.send).toHaveBeenCalledWith({
        error: 'Bad Request: missing field',
        statusCode: 400,
      });
    });

    it('should default to 500 if statusCode is missing', async () => {
      process.env.PORT = '3001';
      process.env.NODE_ENV = 'development';

      vi.resetModules();
      await import('./server.js');

      const errorHandler = (__mockApp.setErrorHandler as any).mock.calls[0][0];

      const mockReply = {
        status: vi.fn().mockReturnThis(),
        send: vi.fn(),
      };

      const error = { message: 'Something went wrong' };
      errorHandler(error, {}, mockReply);

      expect(mockReply.status).toHaveBeenCalledWith(500);
      expect(mockReply.send).toHaveBeenCalledWith({
        error: 'Internal Server Error',
        statusCode: 500,
      });
    });

    it('should default to "Internal Server Error" if message is missing on 5xx', async () => {
      process.env.PORT = '3001';
      process.env.NODE_ENV = 'development';

      vi.resetModules();
      await import('./server.js');

      const errorHandler = (__mockApp.setErrorHandler as any).mock.calls[0][0];

      const mockReply = {
        status: vi.fn().mockReturnThis(),
        send: vi.fn(),
      };

      const error = { statusCode: 503 };
      errorHandler(error, {}, mockReply);

      expect(mockReply.status).toHaveBeenCalledWith(503);
      expect(mockReply.send).toHaveBeenCalledWith({
        error: 'Internal Server Error',
        statusCode: 503,
      });
    });

    it('should use message for non-5xx errors without a message property', async () => {
      process.env.PORT = '3001';
      process.env.NODE_ENV = 'development';

      vi.resetModules();
      await import('./server.js');

      const errorHandler = (__mockApp.setErrorHandler as any).mock.calls[0][0];

      const mockReply = {
        status: vi.fn().mockReturnThis(),
        send: vi.fn(),
      };

      const error = { statusCode: 422 };
      errorHandler(error, {}, mockReply);

      expect(mockReply.status).toHaveBeenCalledWith(422);
      expect(mockReply.send).toHaveBeenCalledWith({
        error: 'Internal Server Error',
        statusCode: 422,
      });
    });

    it('should handle 401 unauthorized errors', async () => {
      process.env.PORT = '3001';
      process.env.NODE_ENV = 'development';

      vi.resetModules();
      await import('./server.js');

      const errorHandler = (__mockApp.setErrorHandler as any).mock.calls[0][0];

      const mockReply = {
        status: vi.fn().mockReturnThis(),
        send: vi.fn(),
      };

      const error = { statusCode: 401, message: 'Invalid token' };
      errorHandler(error, {}, mockReply);

      expect(mockReply.status).toHaveBeenCalledWith(401);
      expect(mockReply.send).toHaveBeenCalledWith({
        error: 'Invalid token',
        statusCode: 401,
      });
    });

    it('should handle 404 as error with not found message', async () => {
      process.env.PORT = '3001';
      process.env.NODE_ENV = 'development';

      vi.resetModules();
      await import('./server.js');

      const errorHandler = (__mockApp.setErrorHandler as any).mock.calls[0][0];

      const mockReply = {
        status: vi.fn().mockReturnThis(),
        send: vi.fn(),
      };

      const error = { statusCode: 404, message: 'Resource not found' };
      errorHandler(error, {}, mockReply);

      expect(mockReply.status).toHaveBeenCalledWith(404);
      expect(mockReply.send).toHaveBeenCalledWith({
        error: 'Resource not found',
        statusCode: 404,
      });
    });
  });

  describe('not found handler', () => {
    it('should reply with 404 Not Found', async () => {
      process.env.PORT = '3001';
      process.env.NODE_ENV = 'development';

      vi.resetModules();
      await import('./server.js');

      const notFoundHandler = (__mockApp.setNotFoundHandler as any).mock.calls[0][0];

      const mockReply = {
        status: vi.fn().mockReturnThis(),
        send: vi.fn(),
      };

      notFoundHandler({}, mockReply);

      expect(mockReply.status).toHaveBeenCalledWith(404);
      expect(mockReply.send).toHaveBeenCalledWith({
        error: 'Not Found',
        statusCode: 404,
      });
    });
  });

  describe('edge cases', () => {
    it('should handle PORT env var with whitespace', async () => {
      process.env.PORT = '  4000  ';
      process.env.NODE_ENV = 'development';

      vi.resetModules();
      await import('./server.js');

      expect(__mockApp.listen).toHaveBeenCalledWith({ port: 4000, host: '127.0.0.1' });
    });

    it('should handle PORT env var set to empty string', async () => {
      process.env.PORT = '';
      process.env.NODE_ENV = 'development';

      vi.resetModules();
      await import('./server.js');

      expect(__mockApp.listen).toHaveBeenCalledWith({ port: 3001, host: '127.0.0.1' });
    });

    it('should handle NODE_ENV undefined defaulting to development host', async () => {
      delete process.env.NODE_ENV;
      delete process.env.PORT;

      vi.resetModules();
      await import('./server.js');

      expect(__mockApp.listen).toHaveBeenCalledWith({ port: 3001, host: '127.0.0.1' });
    });

    it('should use 0.0.0.0 for any non-production NODE_ENV matching production', async () => {
      process.env.NODE_ENV = 'production';
      delete process.env.PORT;

      vi.resetModules();
      await import('./server.js');

      expect(__mockApp.listen).toHaveBeenCalledWith({ port: 3001, host: '0.0.0.0' });
    });

    it('should use 127.0.0.1 for test environment', async () => {
      process.env.NODE_ENV = 'test';
      delete process.env.PORT;

      vi.resetModules();
      await import('./server.js');

      expect(__mockApp.listen).toHaveBeenCalledWith({ port: 3001, host: '127.0.0.1' });
    });

    it('should handle PORT as a very large number', async () => {
      process.env.PORT = '99999';
      process.env.NODE_ENV = 'development';

      vi.resetModules();
      await import('./server.js');

      expect(__mockApp.listen).toHaveBeenCalledWith({ port: 99999, host: '127.0.0.1' });
    });

    it('should handle PORT as 0', async () => {
      process.env.PORT = '0';
      process.env.NODE_ENV = 'development';

      vi.resetModules();
      await import('./server.js');

      expect(__mockApp.listen).toHaveBeenCalledWith({ port: 0, host: '127.0.0.1' });
    });

    it('should handle PORT as negative number', async () => {
      process.env.PORT = '-1';
      process.env.NODE_ENV = 'development';

      vi.resetModules();
      await import('./server.js');

      expect(__mockApp.listen).toHaveBeenCalledWith({ port: -1, host: '127.0.0.1' });
    });

    it('should handle PORT as non-numeric string', async () => {
      process.env.PORT = 'abc';
      process.env.NODE_ENV = 'development';

      vi.resetModules();
      await import('./server.js');

      expect(__mockApp.listen).toHaveBeenCalledWith({ port: NaN, host: '127.0.0.1' });
    });
  });
});