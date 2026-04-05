import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { checkSslTool } from './check-ssl.js';
import { connect } from 'node:tls';

vi.mock('node:tls', () => ({
  connect: vi.fn(),
}));

const mockSocket = {
  getPeerCertificate: vi.fn(),
  getProtocol: vi.fn(),
  authorized: false,
  authorizationError: null as string | null,
  destroy: vi.fn(),
  on: vi.fn(),
};

describe('checkSslTool', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    mockSocket.getPeerCertificate.mockReturnValue({});
    mockSocket.getProtocol.mockReturnValue('TLSv1.3');
    mockSocket.authorized = false;
    mockSocket.authorizationError = null;
    mockSocket.destroy.mockReset();
    mockSocket.on.mockReset();
    vi.mocked(connect).mockReset().mockReturnValue(mockSocket as any);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('Tool Configuration', () => {
    it('should have the correct tool name', () => {
      expect(checkSslTool.name).toBe('check_ssl');
    });

    it('should have a description', () => {
      expect(checkSslTool.description).toBeDefined();
      expect(typeof checkSslTool.description).toBe('string');
    });

    it('should require hostname in the input schema', () => {
      expect(checkSslTool.input_schema.required).toContain('hostname');
    });

    it('should define hostname and port properties in the input schema', () => {
      expect(checkSslTool.input_schema.properties).toHaveProperty('hostname');
      expect(checkSslTool.input_schema.properties).toHaveProperty('port');
    });
  });

  describe('execute', () => {
    const simulateSuccessfulConnection = () => {
      const connectCall = vi.mocked(connect).mock.calls[0];
      if (connectCall) {
        const options = connectCall[0];
        const callback = connectCall[1];
        if (callback) callback();
      }
    };

    const simulateSocketError = (error: Error) => {
      const errorListener = mockSocket.on.mock.calls.find(call => call[0] === 'error');
      if (errorListener) {
        (errorListener[1] as Function)(error);
      }
    };

    const createValidCert = (overrides: Record<string, any> = {}) => ({
      subject: { CN: 'example.com' },
      issuer: { O: 'DigiCert', CN: 'DigiCert SHA2 Extended Validation Server CA' },
      valid_from: 'Jan  1 00:00:00 2023 GMT',
      valid_to: 'Jan  1 00:00:00 2099 GMT',
      serialNumber: '0123456789ABCDEF',
      fingerprint: 'AB:CD:EF:01:23:45:67:89:AB:CD:EF:01:23:45:67:89:AB:CD:EF:01:23:45:67:89',
      subjectaltname: 'DNS:example.com, DNS:www.example.com',
      ...overrides,
    });

    it('should strip http:// and trailing paths from hostname', async () => {
      mockSocket.getPeerCertificate.mockReturnValue(createValidCert());
      mockSocket.authorized = true;

      const promise = checkSslTool.execute({ hostname: 'http://example.com/some/path' });
      await vi.advanceTimersByTimeAsync(0);
      simulateSuccessfulConnection();
      
      const result = JSON.parse(await promise as string);
      expect(result.hostname).toBe('example.com');
    });

    it('should strip https:// from hostname', async () => {
      mockSocket.getPeerCertificate.mockReturnValue(createValidCert());
      mockSocket.authorized = true;

      const promise = checkSslTool.execute({ hostname: 'https://example.com' });
      await vi.advanceTimersByTimeAsync(0);
      simulateSuccessfulConnection();
      
      const result = JSON.parse(await promise as string);
      expect(result.hostname).toBe('example.com');
    });

    it('should default port to 443 if not provided', async () => {
      mockSocket.getPeerCertificate.mockReturnValue(createValidCert());
      mockSocket.authorized = true;

      const promise = checkSslTool.execute({ hostname: 'example.com' });
      await vi.advanceTimersByTimeAsync(0);
      simulateSuccessfulConnection();
      
      const connectOptions = vi.mocked(connect).mock.calls[0][0];
      expect(connectOptions.port).toBe(443);
      
      const result = JSON.parse(await promise as string);
      expect(result.port).toBe(443);
    });

    it('should accept a custom port', async () => {
      mockSocket.getPeerCertificate.mockReturnValue(createValidCert());
      mockSocket.authorized = true;

      const promise = checkSslTool.execute({ hostname: 'example.com', port: 8443 });
      await vi.advanceTimersByTimeAsync(0);
      simulateSuccessfulConnection();
      
      const connectOptions = vi.mocked(connect).mock.calls[0][0];
      expect(connectOptions.port).toBe(8443);
      
      const result = JSON.parse(await promise as string);
      expect(result.port).toBe(8443);
    });

    it('should return status "valid" for a valid, authorized certificate', async () => {
      mockSocket.getPeerCertificate.mockReturnValue(createValidCert());
      mockSocket.authorized = true;

      const promise = checkSslTool.execute({ hostname: 'example.com' });
      await vi.advanceTimersByTimeAsync(0);
      simulateSuccessfulConnection();
      
      const result = JSON.parse(await promise as string);
      expect(result.status).toBe('valid');
      expect(result.hasSsl).toBe(true);
      expect(result.authorized).toBe(true);
      expect(result.protocol).toBe('TLSv1.3');
      expect(result.recommendation).toBeUndefined();
    });

    it('should return status "expired" if current date is after valid_to', async () => {
      vi.setSystemTime(new Date('2100-06-01'));
      mockSocket.getPeerCertificate.mockReturnValue(createValidCert({
        valid_from: 'Jan  1 00:00:00 2023 GMT',
        valid_to: 'Jan  1 00:00:00 2050 GMT',
      }));
      mockSocket.authorized = true;

      const promise = checkSslTool.execute({ hostname: 'example.com' });
      await vi.advanceTimersByTimeAsync(0);
      simulateSuccessfulConnection();
      
      const result = JSON.parse(await promise as string);
      expect(result.status).toBe('expired');
      expect(result.certificate.daysRemaining).toBeLessThan(0);
      expect(result.recommendation).toContain('SSL certificate has expired');
    });

    it('should return status "not_yet_valid" if current date is before valid_from', async () => {
      vi.setSystemTime(new Date('2020-06-01'));
      mockSocket.getPeerCertificate.mockReturnValue(createValidCert({
        valid_from: 'Jan  1 00:00:00 2023 GMT',
        valid_to: 'Jan  1 00:00:00 2099 GMT',
      }));

      const promise = checkSslTool.execute({ hostname: 'example.com' });
      await vi.advanceTimersByTimeAsync(0);
      simulateSuccessfulConnection();
      
      const result = JSON.parse(await promise as string);
      expect(result.status).toBe('not_yet_valid');
    });

    it('should return status "untrusted" if certificate is valid but not authorized', async () => {
      vi.setSystemTime(new Date('2050-06-01'));
      mockSocket.getPeerCertificate.mockReturnValue(createValidCert());
      mockSocket.authorized = false;
      mockSocket.authorizationError = 'UNABLE_TO_VERIFY_LEAF_SIGNATURE';

      const promise = checkSslTool.execute({ hostname: 'example.com' });
      await vi.advanceTimersByTimeAsync(0);
      simulateSuccessfulConnection();
      
      const result = JSON.parse(await promise as string);
      expect(result.status).toBe('untrusted');
      expect(result.authorized).toBe(false);
      expect(result.authorizationError).toBe('UNABLE_TO_VERIFY_LEAF_SIGNATURE');
      expect(result.recommendation).toContain('not trusted by standard CA roots');
    });

    it('should return status "expiring_soon" if days remaining is 30 or less', async () => {
      const now = new Date('2050-06-01');
      vi.setSystemTime(now);
      
      const validTo = new Date('2050-06-25'); // 24 days remaining
      mockSocket.getPeerCertificate.mockReturnValue(createValidCert({
        valid_from: 'Jan  1 00:00:00 2023 GMT',
        valid_to: validTo.toUTCString(),
      }));
      mockSocket.authorized = true;

      const promise = checkSslTool.execute({ hostname: 'example.com' });
      await vi.advanceTimersByTimeAsync(0);
      simulateSuccessfulConnection();
      
      const result = JSON.parse(await promise as string);
      expect(result.status).toBe('expiring_soon');
      expect(result.certificate.daysRemaining).toBe(24);
      expect(result.recommendation).toContain('SSL certificate expires in 24 days');
    });

    it('should return status "valid" if days remaining is strictly greater than 30', async () => {
      const now = new Date('2050-06-01');
      vi.setSystemTime(now);
      
      const validTo = new Date('2050-08-01'); // > 30 days
      mockSocket.getPeerCertificate.mockReturnValue(createValidCert({
        valid_from: 'Jan  1 00:00:00 2023 GMT',
        valid_to: validTo.toUTCString(),
      }));
      mockSocket.authorized = true;

      const promise = checkSslTool.execute({ hostname: 'example.com' });
      await vi.advanceTimersByTimeAsync(0);
      simulateSuccessfulConnection();
      
      const result = JSON.parse(await promise as string);
      expect(result.status).toBe('valid');
      expect(result.certificate.daysRemaining).toBeGreaterThan(30);
    });

    it('should return status "no_certificate" if cert is empty', async () => {
      mockSocket.getPeerCertificate.mockReturnValue({});

      const promise = checkSslTool.execute({ hostname: 'example.com' });
      await vi.advanceTimersByTimeAsync(0);
      simulateSuccessfulConnection();
      
      const result = JSON.parse(await promise as string);
      expect(result.status).toBe('no_certificate');
      expect(result.hasSsl).toBe(false);
      expect(result.error).toBe('No SSL certificate found');
      expect(mockSocket.destroy).toHaveBeenCalledTimes(1);
    });

    it('should return status "no_certificate" if getPeerCertificate returns null', async () => {
      mockSocket.getPeerCertificate.mockReturnValue(null);

      const promise = checkSslTool.execute({ hostname: 'example.com' });
      await vi.advanceTimersByTimeAsync(0);
      simulateSuccessfulConnection();
      
      const result = JSON.parse(await promise as string);
      expect(result.status).toBe('no_certificate');
    });

    it('should return status "error" on socket error', async () => {
      const promise = checkSslTool.execute({ hostname: 'example.com' });
      await vi.advanceTimersByTimeAsync(0);
      simulateSocketError(new Error('Connection refused'));
      
      const result = JSON.parse(await promise as string);
      expect(result.status).toBe('error');
      expect(result.hasSsl).toBe(false);
      expect(result.error).toBe('Connection refused');
    });

    it('should return status "timeout" if connection takes longer than 10 seconds', async () => {
      const promise = checkSslTool.execute({ hostname: 'example.com' });
      
      // Advance timer past the 10s timeout threshold
      vi.advanceTimersByTime(10001);
      await vi.advanceTimersByTimeAsync(0);
      
      const result = JSON.parse(await promise as string);
      expect(result.status).toBe('timeout');
      expect(result.error).toBe('Connection timed out after 10 seconds');
    });

    it('should clear timeout and not timeout if connection succeeds immediately', async () => {
      mockSocket.getPeerCertificate.mockReturnValue(createValidCert());
      mockSocket.authorized = true;

      const promise = checkSslTool.execute({ hostname: 'example.com' });
      await vi.advanceTimersByTimeAsync(0);
      simulateSuccessfulConnection();
      
      // Advance timer well past the 10s timeout threshold
      vi.advanceTimersByTime(15000);
      await vi.advanceTimersByTimeAsync(0);

      const result = JSON.parse(await promise as string);
      expect(result.status).toBe('valid');
    });

    it('should clear timeout if socket errors out', async () => {
      const promise = checkSslTool.execute({ hostname: 'example.com' });
      await vi.advanceTimersByTimeAsync(0);
      simulateSocketError(new Error('Network Error'));
      
      // Advance timer well past the 10s timeout threshold to ensure it doesn't double-resolve
      vi.advanceTimersByTime(15000);
      await vi.advanceTimersByTimeAsync(0);

      const result = JSON.parse(await promise as string);
      expect(result.status).toBe('error');
      expect(result.error).toBe('Network Error');
    });

    it('should map certificate properties correctly to the output', async () => {
      const cert = createValidCert();
      mockSocket.getPeerCertificate.mockReturnValue(cert);
      mockSocket.authorized = true;

      const promise = checkSslTool.execute({ hostname: 'example.com' });
      await vi.advanceTimersByTimeAsync(0);
      simulateSuccessfulConnection();
      
      const result = JSON.parse(await promise as string);
      
      expect(result.certificate.subject).toBe('example.com');
      expect(result.certificate.issuer).toBe('DigiCert');
      expect(result.certificate.issuerOrg).toBe('DigiCert');
      expect(result.certificate.validFrom).toBe(cert.valid_from);
      expect(result.certificate.validTo).toBe(cert.valid_to);
      expect(result.certificate.serialNumber).toBe(cert.serialNumber);
      expect(result.certificate.fingerprint).toBe('AB:CD:EF:01:23:45:67:89...');
      expect(result.certificate.san).toBe(cert.subjectaltname);
    });

    it('should fallback to hostname if cert.subject.CN is missing', async () => {
      const cert = createValidCert({ subject: {} }); // No CN
      mockSocket.getPeerCertificate.mockReturnValue(cert);
      mockSocket.authorized = true;

      const promise = checkSslTool.execute({ hostname: 'missing-cn.com' });
      await vi.advanceTimersByTimeAsync(0);
      simulateSuccessfulConnection();
      
      const result = JSON.parse(await promise as string);
      expect(result.certificate.subject).toBe('missing-cn.com');
    });

    it('should fallback to issuer CN if issuer O is missing', async () => {
      const cert = createValidCert({
        issuer: { CN: 'Some Root CA' } // No O
      });
      mockSocket.getPeerCertificate.mockReturnValue(cert);
      mockSocket.authorized = true;

      const promise = checkSslTool.execute({ hostname: 'example.com' });
      await vi.advanceTimersByTimeAsync(0);
      simulateSuccessfulConnection();
      
      const result = JSON.parse(await promise as string);
      expect(result.certificate.issuer).toBe('Some Root CA');
    });

    it('should fallback to "Unknown" issuer if both O and CN are missing', async () => {
      const cert = createValidCert({
        issuer: {} // No O or CN
      });
      mockSocket.getPeerCertificate.mockReturnValue(cert);
      mockSocket.authorized = true;

      const promise = checkSslTool.execute({ hostname: 'example.com' });
      await vi.advanceTimersByTimeAsync(0);
      simulateSuccessfulConnection();
      
      const result = JSON.parse(await promise as string);
      expect(result.certificate.issuer).toBe('Unknown');
    });

    it('should catch synchronous exceptions thrown by connect and return error status', async () => {
      vi.mocked(connect).mockImplementation(() => {
        throw new Error('Sync failure during socket creation');
      });

      const promise = checkSslTool.execute({ hostname: 'example.com' });
      await vi.advanceTimersByTimeAsync(0);
      
      const result = JSON.parse(await promise as string);
      expect(result.status).toBe('error');
      expect(result.hasSsl).toBe(false);
      expect(result.error).toBe('Sync failure during socket creation');
    });

    it('should handle non-Error objects thrown by connect', async () => {
      vi.mocked(connect).mockImplementation(() => {
        throw 'String error'; // eslint-disable-line no-throw-literal
      });

      const promise = checkSslTool.execute({ hostname: 'example.com' });
      await vi.advanceTimersByTimeAsync(0);
      
      const result = JSON.parse(await promise as string);
      expect(result.status).toBe('error');
      expect(result.error).toBe('String error');
    });
  });
});