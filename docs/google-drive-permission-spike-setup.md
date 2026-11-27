# Google Drive permission spike setup

This is a disposable test configuration, not production OAuth approval. No Google credentials exist in the checked local environment files as of 2026-11-28.

1. Open https://console.cloud.google.com/ and create/select a dedicated project, for example `GrabPic staging`. Record its project ID and numeric project number.
2. In APIs & Services → Library, enable **Google Drive API** and **Google Picker API**.
3. In Google Auth platform → Branding, set the app name `GrabPic staging`, your support email and developer contact email. Configure Audience as External with publishing status Testing, and add the Google account that owns the fixture as a test user. Use Internal only if the project/account genuinely supports that audience.
4. In Data Access, declare only `https://www.googleapis.com/auth/drive.file` for the initial spike. Do not add full Drive or read-only Drive scopes yet. Folder selection is not evidence that its existing children are authorized.
5. Under Clients, create a **Web application** OAuth client. Add `http://localhost:3000` as an authorized JavaScript origin. For the later server authorization-code flow, register `http://localhost:8787/integrations/google/callback` as an authorized redirect URI. Add exact staging URLs only once the chosen host is known. Origins have no path; redirect URIs must match exactly. The callback is planned and not implemented yet.
6. Create a Picker API key under APIs & Services → Credentials. Apply API restrictions to Picker (and Drive if used directly) and HTTP-referrer restrictions for the test origin plus Google's documented `https://docs.google.com/*` Picker requirement. Follow the current official Picker instructions if Console labels differ. A browser API key is visible by design; restrictions are still required.
7. In your own Drive, create a private folder `GrabPic permission fixture` with 3–5 disposable JPEG/PNG/WebP photos and one unsupported file. Use images you have authority to process. Keep it private; public link sharing is unnecessary. Later use50 photos for acceptance. Include a separately shared folder fixture for resource-key/permission testing.
8. Share the project ID, numeric project number and folder link with the agent. Client ID and API key can be provided through the private setup field; keep client secret, OAuth codes, access tokens and refresh tokens out of chat and Git. Do not authorize the broad production scope during this setup.

## Evidence required before feature implementation

Use this application's OAuth client and a fresh grant. Select only the folder with Picker, then call official `files.list` constrained to that folder's immediate children and `files.get?alt=media` on a known pre-existing image. Compare listing to the known fixture inventory, not merely HTTP200. Repeat private/shared/inaccessible/revoked cases. Record granted scopes, counts and sanitized HTTP statuses; never token values or images.

If `drive.file` cannot enumerate and retrieve every intended child, keep the permission gate blocked. Document the alternatives: explicitly selecting each image with Picker, or broader restricted read-only access with Google verification/security implications. Do not silently broaden scopes. The API itself must never change or delete Drive originals.

## Official references

- [Drive JavaScript quickstart](https://developers.google.com/workspace/drive/api/quickstart/js)
- [Picker web integration and credential setup](https://developers.google.com/workspace/drive/picker/guides/web-picker)
- [Picker sample and API key restrictions](https://developers.google.com/workspace/drive/picker/guides/web-picker-sample)
- [Drive scopes and verification categories](https://developers.google.com/workspace/drive/api/guides/api-specific-auth)
