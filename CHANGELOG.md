## [1.1.8](https://github.com/m-gora/ttrpg-discord-app/compare/v1.1.7...v1.1.8) (2026-03-11)

### Refactors

* remove DM support ([08025ea](https://github.com/m-gora/ttrpg-discord-app/commit/08025eabf87b23363e2dc311c34005a5ca399a59))

## [1.1.7](https://github.com/m-gora/ttrpg-discord-app/compare/v1.1.6...v1.1.7) (2026-03-11)

### Bug Fixes

* sending to dm channels ([56a5ec9](https://github.com/m-gora/ttrpg-discord-app/commit/56a5ec9d137fbb30ec8bac71a4c4e09fade39a2b))

## [1.1.6](https://github.com/m-gora/ttrpg-discord-app/compare/v1.1.5...v1.1.6) (2026-03-11)

### Bug Fixes

* fix the reminder scheduler ([c0c0f3a](https://github.com/m-gora/ttrpg-discord-app/commit/c0c0f3a014fb5ba67c985b908595f3da256fb1ad))

## [1.1.5](https://github.com/m-gora/ttrpg-discord-app/compare/v1.1.4...v1.1.5) (2026-03-11)

### Bug Fixes

* let NATS errors recover gracefully ([1410d0b](https://github.com/m-gora/ttrpg-discord-app/commit/1410d0b609977a8713726fb8ea82415cfa939399))

## [1.1.4](https://github.com/m-gora/ttrpg-discord-app/compare/v1.1.3...v1.1.4) (2026-03-11)

### Bug Fixes

* send reminder as long as it hasn't been sent ([980e908](https://github.com/m-gora/ttrpg-discord-app/commit/980e90827e4cf2b5648ffe267e22eab17f8e104d))

## [1.1.3](https://github.com/m-gora/ttrpg-discord-app/compare/v1.1.2...v1.1.3) (2026-03-11)

### Bug Fixes

* timezone ([af31528](https://github.com/m-gora/ttrpg-discord-app/commit/af31528a9dadf36df7ea2eee0c9f711285cfb45f))

## [1.1.2](https://github.com/m-gora/ttrpg-discord-app/compare/v1.1.1...v1.1.2) (2026-03-11)

### Refactors

* now using event sourcing ([c8500dc](https://github.com/m-gora/ttrpg-discord-app/commit/c8500dc235ca79bc2d9facfa47b020a377363671))

## [1.1.1](https://github.com/m-gora/ttrpg-discord-app/compare/v1.1.0...v1.1.1) (2026-03-08)

### Bug Fixes

* increate NATS memory ([d900a7f](https://github.com/m-gora/ttrpg-discord-app/commit/d900a7f44773c46f156f646f29214ae8ff1a34fc))

## [1.1.0](https://github.com/m-gora/ttrpg-discord-app/compare/v1.0.6...v1.1.0) (2026-03-08)

### Features

* implement messaging via NATS for durability ([6273242](https://github.com/m-gora/ttrpg-discord-app/commit/6273242118d5cb63f9b1f5ad496dbb5c1ed3cdd0))

## [1.0.6](https://github.com/m-gora/ttrpg-discord-app/compare/v1.0.5...v1.0.6) (2026-03-08)

### Bug Fixes

* ensure typing ([4c6e0ec](https://github.com/m-gora/ttrpg-discord-app/commit/4c6e0ec0b0e56e4fe422a5048f49aca3d6787e95))

## [1.0.5](https://github.com/m-gora/ttrpg-discord-app/compare/v1.0.4...v1.0.5) (2026-03-08)

### Bug Fixes

* ephemeral channel responses ([655bff3](https://github.com/m-gora/ttrpg-discord-app/commit/655bff3beb22a0f0858ea1076757957d81f81c86))

## [1.0.4](https://github.com/m-gora/ttrpg-discord-app/compare/v1.0.3...v1.0.4) (2026-03-08)

### Bug Fixes

* need to find a way so argocd doesnt override the secret with dummies all the time ([a285d0d](https://github.com/m-gora/ttrpg-discord-app/commit/a285d0d070201095b493568c484bae202f6a3c3c))

## [1.0.3](https://github.com/m-gora/ttrpg-discord-app/compare/v1.0.2...v1.0.3) (2026-03-08)

### Bug Fixes

* update undici to safe version and don't let argocd override secrets ([99a8891](https://github.com/m-gora/ttrpg-discord-app/commit/99a88915b9da4321824b642ac1d349bdd09f66f8))

## [1.0.2](https://github.com/m-gora/ttrpg-discord-app/compare/v1.0.1...v1.0.2) (2026-03-08)

### Bug Fixes

* dont use bun run in the entrypoint on distroless ([197c8ab](https://github.com/m-gora/ttrpg-discord-app/commit/197c8ab0232966ed63eedb5c4c35eebd9ace09c9))

## [1.0.1](https://github.com/m-gora/ttrpg-discord-app/compare/v1.0.0...v1.0.1) (2026-03-08)

### Bug Fixes

* run as non-root user ([f723156](https://github.com/m-gora/ttrpg-discord-app/commit/f723156cb3a3c598422f8a7b3a97d623094d58fc))

## 1.0.0 (2026-03-07)

### Features

* add campaigns as management feature ([20da522](https://github.com/m-gora/ttrpg-discord-app/commit/20da522f29e0c76c8e48e8c07c7fbf27d54dc1d2))
* add conflict resolver ([18bcc81](https://github.com/m-gora/ttrpg-discord-app/commit/18bcc81f09ee308634edc4513c0be6d5422196ee))
* create TTRPG scheduling app for discord ([2968c50](https://github.com/m-gora/ttrpg-discord-app/commit/2968c50cc75627192288fbb9e4a57569bc1188b5))
* implement k8s deployments ([c8438ca](https://github.com/m-gora/ttrpg-discord-app/commit/c8438ca43dff13f0c8c2fd548ba6046df7f9238f))

### Bug Fixes

* cancelling a session decrements the counter ([a11dec6](https://github.com/m-gora/ttrpg-discord-app/commit/a11dec63a4913eab2e7e47a3e67b809b54d0230d))
