# Grok Ball Pro runtime pin

The application downloads and verifies the original SVG/JS runtime, not prerendered GIFs or imitation artwork.

- Source: https://github.com/AshinTop/grok-ball-pro
- Pinned commit: 308db672da87402a2997a97306f4151eac2fcada
- Path: src/grok-ball.js
- Git blob SHA-1: 876966b2da2c16b572dca956320bd256d17b3e78
- SDK: GrokBall.BODIES (9 body IDs), GrokBall.setBody(), 42 expression IDs.
- Run `node scripts/bootstrap.cjs` to update the pinned runtime into vendor/grok-ball.js; old original-only engines no longer pass verification.
- No upstream music, lyrics, MV footage or official brand images are bundled.

Source code is MIT licensed with inherited tycoding credit. Fan-made character designs do not grant third-party commercial character or trademark rights.
