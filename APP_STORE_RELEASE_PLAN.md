1. **Choose packaging approach:** wrap the existing static PWA with **Capacitor** to produce native Android and iOS projects while keeping the current frontend/storage code.

2. **Add native project setup:** install Node locally, add Capacitor, configure the app ID (for example `com.dheffx.duckpin`), app name, icons, splash screen, and offline asset bundle.

3. **Verify native storage:** confirm current `localStorage` behavior works in the Android/iOS WebView and that JSON history export/import still works through native file sharing.

4. **Create store assets:** 512px Android icon, iOS icon set, phone screenshots, feature graphic for Google Play, app description, support email, and a simple privacy-policy page.

5. **Prepare policy disclosures:** declare that the app stores score/history data locally on-device, uses no account/backend, and does not collect or sell personal data—assuming no analytics or ads are added.

6. **Register developer accounts:** Google Play Console is a one-time **$25** fee; Apple Developer Program is **$99/year**.

7. **Build and test Android:** create a signed Android App Bundle (`.aab`), test on physical Android devices, then upload to Google Play’s internal testing track.

8. **Build and test iOS:** open the Capacitor iOS project in Xcode on a Mac, configure signing/provisioning, test on physical iPhones through TestFlight.

9. **Submit store listings:** complete content ratings, privacy/data-safety forms, screenshots, store descriptions, and release notes; submit Android for review and iOS through App Store Connect.

10. **Maintain updates:** future web changes would be released by rebuilding and resubmitting the native packages; GitHub Pages would remain useful as the browser/PWA version.

## Detailed release plan

> This is a packaging and release plan only. Do not create the native projects until the app identity, developer accounts, and store listing name are chosen. Store policies and target-SDK requirements change frequently; verify them in the official links below immediately before submission.

### 1. Choose Capacitor as the native wrapper

- Keep the existing dependency-free HTML, CSS, JavaScript, assets, scoring logic, and local browser storage model.
- Use [Capacitor](https://capacitorjs.com/docs/getting-started) to bundle that web app into Android and iOS projects.
- Do **not** turn GitHub Pages into the app's runtime source. Ship the built static files inside each native app so scoring works offline and does not depend on the network.
- Keep GitHub Pages as the browser/PWA distribution channel. The native store builds become an additional distribution channel.
- Decide the permanent identifiers before publishing:
  - Android application ID, for example `com.dheffx.duckpin`.
  - iOS bundle ID, normally the same reverse-DNS value.
  - Store display name. This can change later, but the application/bundle ID generally cannot be reused after a store release.

### 2. Prepare the local development environment and native project

#### Prerequisites

- Install Node.js 20 or newer. This project currently declares `"node": ">=20"` in `package.json`; Node/npm are not installed in the current development environment.
- For Android:
  - Install [Android Studio](https://developer.android.com/studio).
  - Install the Android SDK, Android SDK Build-Tools, platform tools, and a current Android SDK platform.
  - Install a compatible JDK if Android Studio does not provide one automatically.
- For iOS:
  - Use a Mac with current [Xcode](https://developer.apple.com/xcode/).
  - Sign in to Xcode with the Apple ID enrolled in the Apple Developer Program.
  - Install CocoaPods if Xcode/Capacitor prompts for it.

#### Add a portable static build directory

Capacitor requires a separate web-assets directory containing an `index.html`; using the repository root is not appropriate because it also contains source, tests, native projects, and Git metadata.

1. Add a small Node build script, such as `scripts/build-static.mjs`, that:
   - Deletes `dist/`.
   - Copies `index.html`, `manifest.webmanifest`, and `sw.js`.
   - Recursively copies `src/`, `assets/`, and `icons/`.
   - Does not copy tests, documentation, `.git`, or future native project directories.
2. Add scripts similar to:

   ```json
   {
     "scripts": {
       "build": "node scripts/build-static.mjs",
       "test": "node --test tests/*.test.mjs",
       "start": "python3 -m http.server 4173"
     }
   }
   ```

3. Run and inspect the output:

   ```sh
   npm install
   npm run build
   python3 -m http.server 4173 --directory dist
   ```

4. Confirm a complete game, history import/export, service-worker registration, and offline reload all work from `dist/`.

#### Install and initialize Capacitor

From the repository root, after the static build step exists:

```sh
npm install @capacitor/core
npm install --save-dev @capacitor/cli
npx cap init
```

Use these values in the initialization prompts:

```text
App name: Duckpin Scorekeeper
App ID: com.dheffx.duckpin
Web asset directory: dist
```

Then install both platform packages and create their native projects:

```sh
npm install @capacitor/android @capacitor/ios
npx cap add android
npx cap add ios
npm run build
npx cap sync
```

Expected generated paths:

```text
android/
ios/
capacitor.config.ts   # or capacitor.config.json, depending on initialization choice
dist/
```

Useful Capacitor references:

- [Getting started / add Capacitor to an existing web app](https://capacitorjs.com/docs/getting-started)
- [Capacitor configuration](https://capacitorjs.com/docs/config)
- [Android platform documentation](https://capacitorjs.com/docs/android)
- [iOS platform documentation](https://capacitorjs.com/docs/ios)

### 3. Verify native functionality and close native integration gaps

#### Core test checklist

Test these on physical devices, not only emulators:

- [ ] Start a new game with 1, 2, and several players.
- [ ] Enter legal and illegal duckpin rolls; confirm disabled pin counts remain unavailable.
- [ ] Defer an active player and confirm turn order returns to them after other players.
- [ ] Finish a game; confirm rankings, history, saved groups, preferences, sprites, and rules reference.
- [ ] Force-close and reopen the app; confirm active-game and preferences persistence.
- [ ] Turn on airplane mode; confirm the bundled app opens and scores offline.
- [ ] Test light and dark modes.
- [ ] Test screen sizes from a small phone through a large phone/tablet.

#### Storage

- The app currently stores active games, history, rosters, and settings in `localStorage`.
- Verify that Android WebView and iOS WKWebView retain that storage through relaunches.
- Explain in store metadata/privacy text that uninstalling the native app or clearing its storage removes local-only game data.
- Avoid adding analytics, authentication, cloud sync, ads, or remote APIs unless the privacy policy and store disclosures are updated first.

#### File transfer and sharing

The existing browser APIs need device testing in the native wrapper:

- JSON export uses a generated browser download.
- JSON import uses a browser file input.
- Score sharing uses the Web Share API or clipboard.

If a feature does not behave well inside a native WebView, add the official Capacitor plugin rather than creating a platform-specific workaround:

```sh
npm install @capacitor/share
npm install @capacitor/filesystem
npx cap sync
```

Likely outcomes:

- Use [`@capacitor/share`](https://capacitorjs.com/docs/apis/share) for reliable Android/iOS score sharing.
- Use [`@capacitor/filesystem`](https://capacitorjs.com/docs/apis/filesystem) plus a file-picker solution only if browser download/upload behavior proves insufficient.
- Keep the browser implementation as a fallback for GitHub Pages.

#### Service worker

- Test the existing PWA service worker in Capacitor before shipping.
- If it causes stale bundled assets or update confusion in the native app, skip service-worker registration when running under Capacitor and rely on the bundled offline assets instead.
- Do not remove offline support from the GitHub Pages PWA when making that distinction.

### 4. Produce store assets and public support material

#### Icons and splash screens

- The project already has duck-sprite PWA icons, but native stores need platform-specific icon sets.
- Generate native icons/splash images from a high-resolution source. A transparent 96px sprite is suitable as artwork but should be placed on a deliberate solid/icon background before generating store-scale assets.
- Consider [`@capacitor/assets`](https://github.com/ionic-team/capacitor-assets):

  ```sh
  npm install --save-dev @capacitor/assets
  npx capacitor-assets generate
  ```

- Verify Android adaptive-icon safe zones and the iOS AppIcon output in the native IDEs.

#### Screenshots and listing copy

Prepare:

- A concise app description: offline duckpin scorekeeper, automatic turn flow, local-only history, and JSON backup/import.
- Support contact email.
- Support URL and privacy-policy URL.
- Android phone screenshots plus any tablet screenshots you choose to support.
- Google Play feature graphic (commonly 1024 × 500; verify current requirements in Play Console).
- iPhone screenshots from supported simulator/device sizes shown in App Store Connect.
- Release notes for the first store release.

Recommended screenshot set:

1. New-game setup with the duckpin art.
2. Active turn with the scoring keypad.
3. Strike/spare terrier celebration.
4. Final rankings and summary.
5. Game history and JSON controls.

#### Privacy policy

- Host a simple public privacy-policy page, for example on GitHub Pages at `/privacy.html`.
- State precisely:
  - Scores, history, saved groups, and preferences are stored locally on the device.
  - The app has no account system and no backend.
  - The app does not collect, sell, or transmit personal data, if that remains true.
  - Exported JSON files are created only at the user's request.
  - The user can erase local app data through Preferences.
- Include a support contact address and an effective date.

### 5. Complete privacy, content, and legal disclosures

#### Google Play

- Complete the Data safety form based on actual shipped behavior.
- Complete the content rating questionnaire.
- Complete the app-content declarations, including ads, target audience, and data practices.
- Add the public privacy-policy URL even for a local-only app if Play Console requires it for the selected declarations.
- Use [Google Play Console Help](https://support.google.com/googleplay/android-developer/) and the [Android distribution documentation](https://developer.android.com/distribute/console) as the source of truth.

#### Apple

- Complete App Privacy answers in App Store Connect based on actual shipped behavior.
- Complete the age rating questionnaire.
- Provide privacy-policy and support URLs.
- Review the [App Review Guidelines](https://developer.apple.com/app-store/review/guidelines/) before submission.

#### Before final disclosure submission

- [ ] Remove development-only logging or diagnostics that could expose user-entered names.
- [ ] Recheck every third-party SDK/plugin. Adding one can change privacy answers.
- [ ] Do not claim “no data collected” if future crash reporting, analytics, ads, or hosted sync are enabled.

### 6. Create developer accounts

#### Google Play Console

1. Create or use a Google account dedicated to publishing.
2. Enroll at [Google Play Console](https://play.google.com/console/).
3. Pay the one-time registration fee, currently described as US$25.
4. Complete identity, payments, and developer-profile verification requested by Google.
5. Configure account access so only trusted people can publish releases.

#### Apple Developer Program

1. Enroll at [Apple Developer Program enrollment](https://developer.apple.com/programs/enroll/).
2. Pay the annual membership fee, currently described as US$99/year in the United States; confirm local pricing.
3. Choose individual versus organization enrollment carefully.
4. In the Apple developer account, register the app’s permanent bundle identifier.
5. In [App Store Connect](https://appstoreconnect.apple.com/), create an app record using that bundle identifier.

### 7. Build, sign, test, and distribute Android

#### Configure Android

```sh
npm run build
npx cap sync android
npx cap open android
```

In Android Studio:

1. Confirm the `applicationId` matches the chosen permanent ID.
2. Set the release version name and incrementing version code.
3. Set the current target SDK required by Google Play; confirm the requirement in Play Console before release.
4. Configure an adaptive app icon and launch screen.
5. Test on at least one current physical Android phone.

#### Sign the release

1. Create an upload keystore using Android Studio's **Build → Generate Signed Bundle / APK** flow.
2. Store the keystore file, alias, and passwords in a secure password manager/backed-up secure location.
3. Never commit keystores or signing passwords to Git.
4. Generate a signed Android App Bundle (`.aab`), not only an APK.

#### Use Play testing tracks

1. Create the app in Play Console.
2. Upload the `.aab` to **Internal testing** first.
3. Add tester email addresses and install from the Play testing link.
4. Test upgrade behavior from one internal build to the next.
5. Promote through closed/open testing if desired, then create the production release.

Useful Android references:

- [Publish your app](https://developer.android.com/studio/publish)
- [Sign your app](https://developer.android.com/studio/publish/app-signing)
- [Google Play Console Help](https://support.google.com/googleplay/android-developer/)

### 8. Build, sign, test, and distribute iOS

#### Configure iOS

```sh
npm run build
npx cap sync ios
npx cap open ios
```

In Xcode:

1. Select the app target.
2. Set the display name, bundle identifier, version, and build number.
3. Choose the Apple Developer team for automatic signing, or configure certificates/profiles manually if required.
4. Add the native app icons and launch-screen assets.
5. Run on a physical iPhone.

#### Test with TestFlight

1. In Xcode, select **Product → Archive** for a release build.
2. Upload the archive to App Store Connect.
3. Wait for Apple processing.
4. Add internal testers first; use external TestFlight testing if useful.
5. Test:
   - Fresh install.
   - Upgrade from a prior TestFlight build.
   - Offline startup.
   - Share/export/import behavior.
   - Local-data clearing and uninstall/reinstall behavior.

Useful Apple references:

- [Xcode distribution overview](https://developer.apple.com/documentation/xcode/distributing-your-app-for-beta-testing-and-releases)
- [TestFlight overview](https://developer.apple.com/testflight/)
- [App Store Connect Help](https://developer.apple.com/help/app-store-connect/)

### 9. Submit the store listings

#### Google Play production submission

- [ ] App name, short description, full description, category, and contact details.
- [ ] Store icon, feature graphic, screenshots, and optional promotional video.
- [ ] Privacy-policy URL.
- [ ] Data safety, content rating, target audience, ads, and app-access answers.
- [ ] Signed `.aab` uploaded with release notes.
- [ ] Internal/closed testing feedback addressed.
- [ ] Production rollout submitted for review.

#### App Store submission

- [ ] App record completed in App Store Connect.
- [ ] Name, subtitle, category, support URL, privacy-policy URL, and description.
- [ ] Required screenshots for the selected device families.
- [ ] App Privacy, age rating, export compliance, and review contact information.
- [ ] A processed release build attached to the app version.
- [ ] Clear review notes explaining that scoring and history are local-only and work offline.
- [ ] Submission to App Review.

### 10. Maintain releases after launch

#### Release workflow

For every native update:

```sh
npm test
npm run build
npx cap sync
```

Then:

1. Increment Android version code/version name and iOS build/version.
2. Test the release build on physical devices.
3. Create a signed Android `.aab`.
4. Archive/upload the iOS build through Xcode.
5. Submit the respective store releases with clear release notes.

#### Keep web and native distributions aligned

- Continue deploying the static app to GitHub Pages for direct browser/PWA use.
- Use the same source commit/tag for the GitHub Pages update and native release whenever possible.
- Native users receive feature changes only after a rebuilt, signed, and store-approved package is released.
- Do not rely on GitHub Pages cache-busting alone for native releases; Capacitor packages the `dist/` output at build time.
- Keep a short release checklist and a record of Android version codes/iOS build numbers.
