// SSL/TLS certificate checker — connects to a host and reads the cert.
// Uses Node.js built-in tls module. No external API needed.

import { connect } from "node:tls";
import type { Tool } from "../core/types.js";

export const checkSslTool: Tool = {
  name: "check_ssl",
  description:
    "Check the SSL/TLS certificate of a website. Returns validity status, issuer, expiry date, days remaining, and protocol version. Use this to identify sites with expired or missing SSL certificates.",
  input_schema: {
    type: "object",
    properties: {
      hostname: {
        type: "string",
        description: "The hostname to check (e.g. 'example.com')",
      },
      port: {
        type: "number",
        description: "Port number (default: 443)",
      },
    },
    required: ["hostname"],
  },
  async execute(input: Record<string, unknown>) {
    const hostname = (input.hostname as string).replace(/^https?:\/\//, "").replace(/\/.*$/, "");
    const port = (input.port as number) || 443;

    return new Promise((resolve) => {
      const timeout = setTimeout(() => {
        resolve(
          JSON.stringify({
            hostname,
            port,
            status: "timeout",
            error: "Connection timed out after 10 seconds",
          })
        );
      }, 10000);

      try {
        const socket = connect(
          { host: hostname, port, servername: hostname, rejectUnauthorized: false },
          () => {
            clearTimeout(timeout);
            const cert = socket.getPeerCertificate();
            const protocol = socket.getProtocol();
            const authorized = socket.authorized;
            const authorizationError = socket.authorizationError;

            if (!cert || Object.keys(cert).length === 0) {
              socket.destroy();
              resolve(
                JSON.stringify({
                  hostname,
                  port,
                  status: "no_certificate",
                  hasSsl: false,
                  error: "No SSL certificate found",
                })
              );
              return;
            }

            const now = new Date();
            const validFrom = new Date(cert.valid_from);
            const validTo = new Date(cert.valid_to);
            const daysRemaining = Math.floor((validTo.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
            const isExpired = now > validTo;
            const isNotYetValid = now < validFrom;

            let status: string;
            if (isExpired) status = "expired";
            else if (isNotYetValid) status = "not_yet_valid";
            else if (!authorized) status = "untrusted";
            else if (daysRemaining <= 30) status = "expiring_soon";
            else status = "valid";

            socket.destroy();

            resolve(
              JSON.stringify({
                hostname,
                port,
                hasSsl: true,
                status,
                authorized,
                authorizationError: authorizationError || undefined,
                protocol: protocol || "unknown",
                certificate: {
                  subject: cert.subject?.CN || hostname,
                  issuer: cert.issuer?.O || cert.issuer?.CN || "Unknown",
                  issuerOrg: cert.issuer?.O || undefined,
                  validFrom: cert.valid_from,
                  validTo: cert.valid_to,
                  daysRemaining,
                  serialNumber: cert.serialNumber || undefined,
                  fingerprint: cert.fingerprint?.slice(0, 23) + "..." || undefined,
                  san: cert.subjectaltname || undefined,
                },
                recommendation:
                  status === "expired"
                    ? "SSL certificate has expired. This is a critical security issue and hurts SEO."
                    : status === "expiring_soon"
                      ? `SSL certificate expires in ${daysRemaining} days. Should be renewed soon.`
                      : status === "untrusted"
                        ? "SSL certificate is not trusted by standard CA roots. May cause browser warnings."
                        : undefined,
              })
            );
          }
        );

        socket.on("error", (err) => {
          clearTimeout(timeout);
          resolve(
            JSON.stringify({
              hostname,
              port,
              hasSsl: false,
              status: "error",
              error: err.message,
            })
          );
        });
      } catch (err) {
        clearTimeout(timeout);
        resolve(
          JSON.stringify({
            hostname,
            port,
            hasSsl: false,
            status: "error",
            error: err instanceof Error ? err.message : String(err),
          })
        );
      }
    });
  },
};
