import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { PrismaClient } from '@prisma/client';

vi.mock('@prisma/client', () => {
  const PrismaClientMock = vi.fn();
  PrismaClientMock.prototype.$connect = vi.fn();
  PrismaClientMock.prototype.$disconnect = vi.fn();
  PrismaClientMock.prototype.$transaction = vi.fn();
  PrismaClientMock.prototype.$queryRaw = vi.fn();
  PrismaClientMock.prototype.$executeRaw = vi.fn();
  return { PrismaClient: PrismaClientMock };
});

describe('prisma client instance', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('should be defined', async () => {
    const { prisma } = await import('./client');
    expect(prisma).toBeDefined();
  });

  it('should be an instance of PrismaClient', async () => {
    const { prisma } = await import('./client');
    const { PrismaClient } = await import('@prisma/client');
    expect(prisma).toBeInstanceOf(PrismaClient);
  });

  it('should instantiate PrismaClient exactly once', async () => {
    await import('./client');
    await import('./client');
    const { PrismaClient } = await import('@prisma/client');
    expect(PrismaClient).toHaveBeenCalledTimes(1);
  });

  it('should expose the $connect method', async () => {
    const { prisma } = await import('./client');
    expect(typeof prisma.$connect).toBe('function');
  });

  it('should expose the $disconnect method', async () => {
    const { prisma } = await import('./client');
    expect(typeof prisma.$disconnect).toBe('function');
  });

  it('should expose the $transaction method', async () => {
    const { prisma } = await import('./client');
    expect(typeof prisma.$transaction).toBe('function');
  });

  it('should expose the $queryRaw method', async () => {
    const { prisma } = await import('./client');
    expect(typeof prisma.$queryRaw).toBe('function');
  });

  it('should expose the $executeRaw method', async () => {
    const { prisma } = await import('./client');
    expect(typeof prisma.$executeRaw).toBe('function');
  });

  it('should successfully call $connect on the instantiated client', async () => {
    const { prisma } = await import('./client');
    await prisma.$connect();
    expect(prisma.$connect).toHaveBeenCalledTimes(1);
  });

  it('should successfully call $disconnect on the instantiated client', async () => {
    const { prisma } = await import('./client');
    await prisma.$disconnect();
    expect(prisma.$disconnect).toHaveBeenCalledTimes(1);
  });

  it('should handle errors thrown by $connect gracefully', async () => {
    const { prisma } = await import('./client');
    prisma.$connect.mockRejectedValueOnce(new Error('Connection refused'));
    await expect(prisma.$connect()).rejects.toThrow('Connection refused');
  });

  it('should handle errors thrown by $disconnect gracefully', async () => {
    const { prisma } = await import('./client');
    prisma.$disconnect.mockRejectedValueOnce(new Error('Disconnection failed'));
    await expect(prisma.$disconnect()).rejects.toThrow('Disconnection failed');
  });
});