/* Which addresses this deployment may fetch on a caller's behalf.
 *
 * The media route takes a URL from the page and fetches it, which is the shape
 * of thing that becomes somebody's port scanner: point it at 127.0.0.1 and the
 * error messages tell you what is listening; point it at 169.254.169.254 on a
 * cloud host and the answer is the instance's credentials.
 *
 * So the rule is the same one the URL checks next door use — an allow-list of
 * what the app needs, which is the public internet, rather than a block-list
 * of the tricks somebody has already thought of.
 *
 * Written over parsed addresses rather than over the text of the host, because
 * 010.0.0.1, 2130706433, 0x7f.1 and ::ffff:127.0.0.1 are all loopback and none
 * of them look it. The caller resolves the name first and checks what came
 * back; this decides what came back means.
 */

import { isIP } from "node:net";

export function isPublicAddress(address) {
  const version = isIP(address);

  if (version === 4) {
    const [a, b] = address.split(".").map(Number);
    if (a === 0 || a === 10 || a === 127) return false;
    if (a === 169 && b === 254) return false; // link-local, and the cloud metadata service
    if (a === 172 && b >= 16 && b <= 31) return false;
    if (a === 192 && b === 168) return false;
    if (a === 192 && b === 0) return false; // IETF protocol assignments
    if (a === 100 && b >= 64 && b <= 127) return false; // carrier-grade NAT
    if (a >= 224) return false; // multicast, and everything reserved above it
    return true;
  }

  if (version === 6) {
    const at = address.toLowerCase();
    if (at === "::1" || at === "::") return false;
    if (at.startsWith("fe80")) return false; // link-local
    if (/^f[cd]/.test(at)) return false; // unique local
    if (at.startsWith("ff")) return false; // multicast
    /* An IPv4 address wearing an IPv6 hat routes to the IPv4 one, so it has to
       be judged as what it is rather than as the notation it arrived in. */
    const mapped = /^(?:::ffff:)(\d+\.\d+\.\d+\.\d+)$/.exec(at);
    if (mapped) return isPublicAddress(mapped[1]);
    return true;
  }

  return false;
}
