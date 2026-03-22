import type { ConnectOptions } from "mongoose";

/**
 * Atlas + Windows: TLS sometimes fails when Node picks IPv6 first.
 * Default `family: 4` on win32; set MONGODB_FORCE_IPV4=0 to disable, or =1 to force on any OS.
 */
export function mongoConnectOptions(): ConnectOptions {
  const opts: ConnectOptions = {
    serverSelectionTimeoutMS: 45_000,
  };
  const forceV4 =
    process.env.MONGODB_FORCE_IPV4 === "1" ||
    (process.platform === "win32" && process.env.MONGODB_FORCE_IPV4 !== "0");
  if (forceV4) {
    opts.family = 4;
  }
  return opts;
}
