# ExpoTwinAngular

Application components keep their logic, template and styles together in a component folder:

```text
src/app/plots/plot-tab/
  plot-tab.component.ts
  plot-tab.component.html
  plot-tab.component.scss
```

All 19 application components use external HTML and SCSS files. Feature services remain in their feature folders. Shared controls, theme tokens, ArcGIS widget styles and cross-component cinema overrides live in `src/styles.scss`. Angular component generation defaults to a new folder with external HTML and SCSS.

The language buttons switch both the interface and narration between English and Arabic, update document direction and ArcGIS locale, and remember the choice. Translations live in `src/app/core/translations.ar.ts`; technical IDs and API fields stay unchanged. New data names need Arabic labels or dictionary entries. Arabic narration uses pronunciation-marked speech text and RTL subtitles; English uses LTR. The cinematic voice selector lists voices supplied by the browser/OS. Changing language or voice restarts the current spoken line. If no matching voice is available, subtitles are shown without speech.

### Neural voice-over (correct Saudi Arabic)

Browser voices on Windows are usually the old `Microsoft Hoda – Arabic (Egypt)` voice, which reads Modern Standard Arabic with a flat tone. `npm start` therefore also runs `tools/tts-server.mjs`, a small local server that synthesises the narration with Microsoft's neural **Saudi** voices (`ar-SA-HamedNeural`, `ar-SA-ZariyahNeural`; English: `en-GB-RyanNeural`, `en-GB-SoniaNeural`) through the open-source [msedge-tts](https://github.com/Migushthe2nd/MsEdgeTTS) client. `ng serve` proxies `/tts` to it (`proxy.conf.json`).

- Each beat is spoken as one clip from its fully vocalised `arSpeech` text. Clips are cached as MP3 in `.tts-cache/`; the opening lines and the current run's beats are pre-fetched, so replays are instant.
- The voice menu lists the neural voices with ★. `TTS_AR_VOICE` / `TTS_EN_VOICE` change the defaults, `TTS_PORT` the port (4310).
- Static deployments (GitHub Pages, `.github/workflows/deploy-pages.yml`) cannot run the server, so after `ng build` the workflow runs `node tools/tts-prerender.mjs dist/expo-twin-angular/browser`. It computes every Arabic line the app can speak (all plots × pavilion styles × floor counts, with the app's own `narration-lines.ts`), records each with the Hamed voice and writes `voice/*.mp3` plus `voice/index.json` (about 56 clips, 10 MB). The app plays these recordings when no server answers. Add `--langs=ar,en` to record English too.
- Without the server or recordings (`npm run start:app`) the app falls back to browser voices, then to an online stream. The narration text is sent to Microsoft's speech service; it is the synthetic script with no personal data. For production, use an Azure Speech key with the same voices.

Arabic learning guide: [Markdown](docs/ANGULAR-EXPLAINED-AR.md) and [Word](docs/ANGULAR-EXPLAINED-AR.docx). It explains Angular concepts, all 19 components, services, source files, and the main application flows using examples from this project.

This project was generated using [Angular CLI](https://github.com/angular/angular-cli) version 21.2.30.

## Development server

To start a local development server, run:

```bash
ng serve
```

Once the server is running, open your browser and navigate to `http://localhost:4200/`. The application will automatically reload whenever you modify any of the source files.

## Code scaffolding

Angular CLI includes powerful code scaffolding tools. To generate a new component, run:

```bash
ng generate component component-name
```

For a complete list of available schematics (such as `components`, `directives`, or `pipes`), run:

```bash
ng generate --help
```

## Building

To build the project run:

```bash
ng build
```

This will compile your project and store the build artifacts in the `dist/` directory. By default, the production build optimizes your application for performance and speed.

## Running unit tests

To execute unit tests with the [Vitest](https://vitest.dev/) test runner, use the following command:

```bash
ng test
```

## Running end-to-end tests

For end-to-end (e2e) testing, run:

```bash
ng e2e
```

Angular CLI does not come with an end-to-end testing framework by default. You can choose one that suits your needs.

## Additional Resources

For more information on using the Angular CLI, including detailed command references, visit the [Angular CLI Overview and Command Reference](https://angular.dev/tools/cli) page.
