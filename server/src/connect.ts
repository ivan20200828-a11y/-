import { networkInterfaces } from 'node:os';

import QRCode from 'qrcode';

/**
 * Addresses a phone in the same Wi-Fi can open this computer's server by, http://192.168.1.10:3000.
 * Office and home networks first (192.168…, 10…, 172.16–31…); VPN and other adapters after them.
 */
export function lanAddresses(port: number): string[] {
  const ips = Object.values(networkInterfaces()).flat()
    .filter((a) => a && a.family === 'IPv4' && !a.internal)
    .map((a) => a!.address);
  const local = (ip: string) => /^(192\.168\.|10\.|172\.(1[6-9]|2\d|3[01])\.)/.test(ip);
  return [...new Set([...ips.filter(local), ...ips.filter((ip) => !local(ip))])].map((ip) => `http://${ip}:${port}`);
}

/** QR code of an address for the app's scanner or the phone camera, as an SVG picture. */
export const qrSvg = (text: string) => QRCode.toString(text, { type: 'svg', margin: 2, errorCorrectionLevel: 'M' });

/** The same code drawn with characters, for the server's window. */
export const qrTerminal = (text: string) => QRCode.toString(text, { type: 'terminal', small: true });
