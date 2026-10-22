# Production smoke fixture

`smoke.mp4` is a 4.335-second, 43,914-byte synthetic video: a blue frame and synthesized speech saying “Video Q operations check. The golden lighthouse is beside the blue river.” It contains no user data. SHA-256:

```
d58c4123ef33a36562a4382bb2a36bff00e3151fe05593e937b39368df023671
```

Generated locally with macOS `say -v Samantha` and FFmpeg (320×240, 10 fps, H.264/AAC). The monitor verifies both size and the exact digest before any upload. Replacement requires reviewing the clip and updating the digest in `production-smoke-policy.cjs`.

The workflow uses the [Chrome included in GitHub's Ubuntu 24.04 image](https://github.com/actions/runner-images/blob/main/images/ubuntu/Ubuntu2404-Readme.md) through [Playwright's Chrome channel](https://playwright.dev/docs/browsers#google-chrome--microsoft-edge), without installing browsers or OS packages at runtime.
