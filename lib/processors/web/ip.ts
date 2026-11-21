/**
 * IP literal parsing/classification shared with the Cloudflare functions. The functions'
 * helper module is dependency-free, so the browser bundle reuses the same tested code.
 */
export { parseIPv4, parseIPv6, formatIPv6, classifyIp, blockedIPv4Reason, blockedIPv6Reason } from "../../../functions/api/_lib";
export type { IpInfo } from "../../../functions/api/_lib";
