/** Contabo Black Friday 2026 (the only VPS advertiser with CJ sales). contabo.com/en/black-friday/ read by vpnsmith on
 *  23/11 14:25 CET, re-read 26/11 05:50 CET with prices unchanged, countdown to 1 December 2026 09:00 UTC. The line and its
 *  link render only before that instant; the link goes to vpnsmith /go/contabo-bf (CJ link 17389597, Black Friday page) and is
 *  counted /out:vps-<from>-cbf. After the end, /out/vps?p=cbf falls back to the regular Contabo WireGuard page. */
export const CONTABO_BF_UNTIL = Date.parse("2026-12-01T09:00:00Z");

export function contaboBfLive(now: number = Date.now()): boolean {
  return now < CONTABO_BF_UNTIL;
}

export function ContaboBfLine({ from }: { from: string }) {
  if (!contaboBfLive()) return null;
  return (
    <>
      Contabo&apos;s Black Friday sale is on:{" "}
      <a href={`/out/vps?from=${from}&p=cbf`} rel="sponsored nofollow">Cloud VPS Plus 2 at 7.20 EUR a month instead of 9.00 EUR</a>{" "}
      for the first 24 months (2 vCPU, 4 GB RAM, 75 GB NVMe), read on contabo.com on 26 November 2026, with a countdown to
      1 December 10:00 CET.{" "}
    </>
  );
}
