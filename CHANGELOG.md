## [1.3.0](https://github.com/edycutjong/replay/compare/v1.2.4...v1.3.0) (2026-09-06)

### Game

* **ui:** give the standalone demo a purse ([593cb04](https://github.com/edycutjong/replay/commit/593cb04d515b9dd72cce30a6c4c6ab4b6e541bbe))

## [1.2.4](https://github.com/edycutjong/replay/compare/v1.2.3...v1.2.4) (2026-09-06)

### Fixes

* **ui:** trim the play-money badge to two words ([b73cdf9](https://github.com/edycutjong/replay/commit/b73cdf9c8381f60bb3d086cf331e8be6cbe9360b))

### Docs

* add a DoraHacks badge to the README ([6f81c50](https://github.com/edycutjong/replay/commit/6f81c50e646ab363cdeabf5ab85ea6d6aeeebef7))

## [1.2.3](https://github.com/edycutjong/replay/compare/v1.2.2...v1.2.3) (2026-09-06)

### Fixes

* **audio:** wire up scoreStrike, rowLand and the ghost touch's crowd silence ([9ee5a42](https://github.com/edycutjong/replay/commit/9ee5a423c88e9938fd283bb2f8ed263bc7f58fef))

## [1.2.2](https://github.com/edycutjong/replay/compare/v1.2.1...v1.2.2) (2026-09-06)

### Fixes

* **a11y:** put a real space between the keycap and its label ([370d54f](https://github.com/edycutjong/replay/commit/370d54fe77a87f5930b30e6a96004f41fa4aadee))

## [1.2.1](https://github.com/edycutjong/replay/compare/v1.2.0...v1.2.1) (2026-09-06)

### Fixes

* **a11y:** announce the keycaps, and give the page a main landmark ([6dfe733](https://github.com/edycutjong/replay/commit/6dfe73320abacbc8459cdea693530ef7d81a1abb))

## [1.2.0](https://github.com/edycutjong/replay/compare/v1.1.0...v1.2.0) (2026-09-06)

### Game

* **meta:** give the page a link preview ([a0db605](https://github.com/edycutjong/replay/commit/a0db605e2e0884199e723cb09c29bf85d1495e4f))

## [1.1.0](https://github.com/edycutjong/replay/compare/v1.0.2...v1.1.0) (2026-09-06)

### Game

* **a11y:** cabinet switches on the keyboard - N, M, H, T ([1aa1557](https://github.com/edycutjong/replay/commit/1aa155726ec9c4f39ff8c8482313640423890d88))
* **a11y:** play the whole board from a keyboard ([a426641](https://github.com/edycutjong/replay/commit/a4266411546135dae05eeda3d86e4366d39577ee))
* **bridge:** actually mount the casino host, so the chain decides hosted rounds ([daf8749](https://github.com/edycutjong/replay/commit/daf874932b1bce2db0965cec9d99b9ff018e9ae2))
* **ui:** print the key card on the cabinet ([a2878a6](https://github.com/edycutjong/replay/commit/a2878a63991c5a765d77307d0d801ce547ac2696))

### Fixes

* **bench:** locate TURBO by role, not by exact text ([ee834bf](https://github.com/edycutjong/replay/commit/ee834bfeaa2f6c483a654e311b09c63a831db27a))
* **render:** invalidate the static layer when the ticket is refuted ([bc75838](https://github.com/edycutjong/replay/commit/bc7583872a5f7a375b953735229ab914cf2b2f0b))
* **render:** the bought row goes red when the claim dies, not when the round ends ([f4afb1a](https://github.com/edycutjong/replay/commit/f4afb1aad6d3b0689f13ea7fc9706cc2d8bab931))

### Proof

* widen coverage to all of src/, not just the paytable math ([3bb6077](https://github.com/edycutjong/replay/commit/3bb607764d5bdfa3f364393996266d8fbc30ab88))

### Build and deploy

* add ESLint 9 and a jsdom/testing-library test toolchain ([56646e9](https://github.com/edycutjong/replay/commit/56646e921b06b3c656264ed6dbf56238d72e56bf))
* lint before tests in the verify job ([0b31316](https://github.com/edycutjong/replay/commit/0b31316dd4ef7bb127e7fe896ac86c8812c4d7da))

### Docs

* link the demo video from the first screen ([09e500a](https://github.com/edycutjong/replay/commit/09e500a1c251d0fac18740473108e3b8bd52bebc))

## [1.0.2](https://github.com/edycutjong/replay/compare/v1.0.1...v1.0.2) (2026-09-06)

### Fixes

* **replay:** make the ghost touch reachable and the entropy label true ([371ca56](https://github.com/edycutjong/replay/commit/371ca564e65e32159b9145ed74bcfa59f46e86d4))

## [1.0.1](https://github.com/edycutjong/replay/compare/v1.0.0...v1.0.1) (2026-09-06)

### Render and performance

* **readme:** replace the animated hero with a static render ([9d5d239](https://github.com/edycutjong/replay/commit/9d5d2392d540b9cb5af5a8efce58c1e65e21ee02))

### Build and deploy

* add the security workflows and community health files ([9ce71ba](https://github.com/edycutjong/replay/commit/9ce71baffcafea9d01e142e46a71007db7183942))
* move CodeQL to action v4 and let it actually report ([d160a6d](https://github.com/edycutjong/replay/commit/d160a6d7a2db01d1470197346aaf63b04d4a80d4))
* take the action and Playwright bumps directly, and fix gitleaks on PR events ([34061df](https://github.com/edycutjong/replay/commit/34061df52805447a76033507db9b837eedb8eefa))

### Docs

* point every GitHub URL at the renamed repo ([59c457e](https://github.com/edycutjong/replay/commit/59c457e24ddacf0c3a0023806d950e7042bd7cb4))
* **readme:** normalise to the judge-facing pattern ([a55c430](https://github.com/edycutjong/replay/commit/a55c4305fe1415b2e8eefaa538bae155f30cf5c9))
* swap the README icon and hero for the animated SVGs ([e5b44ed](https://github.com/edycutjong/replay/commit/e5b44ede3f199308a281575b40463eef03ddbdb6))

## 1.0.0 (2026-09-06)

### Game

* **ci:** verify, release and deploy as one pipeline ([293c27a](https://github.com/edycutjong/replay/commit/293c27ae736221841c5b47644909db77040080b9))

### Fixes

* **bench:** keep every wall-clock threshold behind --block-a ([e609427](https://github.com/edycutjong/replay/commit/e609427f4997cc83e82a838b63ce841658d1cf19))
* **release:** pin the conventionalcommits preset to the writer it fits ([7787861](https://github.com/edycutjong/replay/commit/7787861d7f9db24dcef14d3b67bc89f6e57961c1))
* **ui:** give the DOM overlays the board's coordinate system ([32c9cb1](https://github.com/edycutjong/replay/commit/32c9cb1b47e9b5e04cec0b1909f466315b87edfe))
