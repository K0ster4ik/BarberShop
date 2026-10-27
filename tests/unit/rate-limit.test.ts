import { describe, expect, it } from "vitest";
import { clientIp, createRateLimiter } from "@/server/rate-limit";

describe("createRateLimiter", () => {
  it("allows up to the limit within the window, then blocks", () => {
    const limiter = createRateLimiter({ limit: 3, windowMs: 60_000 });
    const now = 1_000_000;
    expect(limiter.consume("ip", now).allowed).toBe(true);
    expect(limiter.consume("ip", now + 1).allowed).toBe(true);
    expect(limiter.consume("ip", now + 2).allowed).toBe(true);

    const blocked = limiter.consume("ip", now + 10_000);
    expect(blocked.allowed).toBe(false);
    expect(blocked.retryAfterMs).toBe(50_000);
  });

  it("starts a new window once the old one expires", () => {
    const limiter = createRateLimiter({ limit: 1, windowMs: 60_000 });
    expect(limiter.consume("ip", 0).allowed).toBe(true);
    expect(limiter.consume("ip", 59_999).allowed).toBe(false);
    expect(limiter.consume("ip", 60_000).allowed).toBe(true);
  });

  it("counts keys separately", () => {
    const limiter = createRateLimiter({ limit: 1, windowMs: 60_000 });
    expect(limiter.consume("a", 0).allowed).toBe(true);
    expect(limiter.consume("b", 0).allowed).toBe(true);
    expect(limiter.consume("a", 1).allowed).toBe(false);
  });
});

describe("clientIp", () => {
  it("takes the first X-Forwarded-For entry set by the proxy", () => {
    expect(
      clientIp(new Headers({ "x-forwarded-for": "203.0.113.7, 10.0.0.1" })),
    ).toBe("203.0.113.7");
  });

  it("falls back to X-Real-IP and then to a shared bucket", () => {
    expect(clientIp(new Headers({ "x-real-ip": "198.51.100.2" }))).toBe(
      "198.51.100.2",
    );
    expect(clientIp(new Headers())).toBe("unknown");
  });
});
