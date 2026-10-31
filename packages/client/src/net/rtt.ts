/** Medidor de RTT por ping e pong (puro): média móvel e variação. */

// SUGESTÃO: peso da média móvel do RTT.
const ALPHA = 0.2;

export class RttMeter {
  value = 0;
  jitter = 0;
  samples = 0;
  last = 0;

  /** Um pong voltou: `sentAt` é o t do ping, `now` o relógio local. */
  onPong(sentAt: number, now: number): number {
    const rtt = Math.max(0, now - sentAt);
    this.last = rtt;
    if (this.samples === 0) {
      this.value = rtt;
      this.jitter = 0;
    } else {
      this.jitter += (Math.abs(rtt - this.value) - this.jitter) * ALPHA;
      this.value += (rtt - this.value) * ALPHA;
    }
    this.samples++;
    return rtt;
  }

  /** RTT arredondado para mandar ao servidor (C2S_Input.rtt). */
  get rounded(): number {
    return Math.round(this.value);
  }

  reset(): void {
    this.value = 0;
    this.jitter = 0;
    this.samples = 0;
  }
}
