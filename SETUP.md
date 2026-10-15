# Exam Desk: putting it online with Google sign-in

This folder is the full website. The site works without any setup: it saves to the browser, just like the Claude version. Sign-in turns on when you fill in your Firebase project's details. After that, each student's marks, PUM choices, countdown and theme follow them to any device they sign in on.

Time needed: about 20 minutes. Cost: free, on Firebase's free Spark plan.

```
exam-desk-site/
├── public/                 ← the website itself
│   ├── index.html          ← all four tools
│   ├── auth.js             ← Google sign-in and saving to your account
│   └── firebase-config.js  ← you paste your project's details here (step 4)
├── firestore.rules         ← who can read and write data (each student only their own)
├── firebase.json           ← Firebase Hosting settings
├── .firebaserc             ← your project ID goes here (step 5)
├── vercel.json             ← settings if you host on Vercel
└── .github/workflows/      ← auto-publish if you host on GitHub Pages
```

---

## 1. Install the tools (once)

1. Install **Node.js** (the LTS version) from https://nodejs.org.
2. Open a terminal (Terminal on Mac, PowerShell on Windows) and run:
   ```
   npm install -g firebase-tools
   ```

## 2. Create the Firebase project

1. Go to https://console.firebase.google.com and sign in with your Google account.
2. Click **Create a project** (or **Add project**). Name it something like `exam-desk`.
   - Google Analytics is optional. You can switch it off.
3. Note the **Project ID** shown under the name (for example `exam-desk-4f2a1`). Your site address will be `https://<project-id>.web.app`.

## 3. Turn on Google sign-in and the database

**Sign-in**
1. In the left menu, open **Build → Authentication → Get started**.
2. Under **Sign-in method**, choose **Google**, switch it on, pick your email as the support email, and click **Save**.

**Database**
1. Open **Build → Firestore Database → Create database**.
2. Choose the location **asia-south1 (Mumbai)**. This is the closest to India, and it can't be changed later.
3. Choose **Start in production mode**. The rules in this folder replace the default ones when you deploy.

## 4. Connect the website to your project

1. Click the gear icon → **Project settings** → scroll to **Your apps** → click the **Web** icon (`</>`).
2. Give it a nickname, such as `Exam Desk web`, and click **Register app**. You don't need to tick Firebase Hosting here.
3. Firebase shows a block of code containing `const firebaseConfig = { ... }`. Copy those six values into `public/firebase-config.js`, replacing every `PASTE_...` placeholder.

These values are safe to publish. They only identify your project. Student data is protected by `firestore.rules`, which lets a signed-in student read and write only their own document.

## 5. Put your project ID in `.firebaserc`

Open `.firebaserc` and replace `PASTE_PROJECT_ID` with your Project ID from step 2.

## 6. Deploy

In the terminal, go into this folder and run:

```
cd path/to/exam-desk-site
firebase login
firebase deploy
```

`firebase login` opens your browser to sign in, once per computer. `firebase deploy` uploads the website and the database rules. When it finishes, it prints your address:

```
Hosting URL: https://<project-id>.web.app
```

Open it, click **Sign in** at the top right, and choose your Google account. Click your picture to see your profile, sign out, or delete your saved data.

**After any change** to the files, run `firebase deploy` again.

---

## Trying it on your computer first (optional)

```
firebase serve --only hosting
```

Then open http://localhost:5000. `localhost` is allowed to use Google sign-in by default.

## Using your own domain (optional)

1. In the console, open **Hosting → Add custom domain** and follow the DNS steps for your domain seller.
2. Then open **Authentication → Settings → Authorized domains** and add the domain. Without this, Google sign-in shows an `auth/unauthorized-domain` error on that domain.

---

## Hosting on GitHub Pages or Vercel instead

You can host the website anywhere. Google sign-in and the database still come from Firebase, so do **steps 2–4** above either way. The differences are:

- **Database rules:** without the Firebase command-line tool, publish the rules by hand. In the console, open **Firestore Database → Rules**, paste the contents of `firestore.rules`, and click **Publish**.
- **Sign-in domain:** add the site's address under **Authentication → Settings → Authorized domains**. That's `yourname.github.io` or `exam-desk.vercel.app`. Without it, sign-in fails with `auth/unauthorized-domain`.

### GitHub Pages
1. Create a new repository on https://github.com, for example `exam-desk`, and upload everything in this folder. That includes the hidden `.github` folder: drag the folder contents in with "uploading an existing file", or use GitHub Desktop.
2. In the repository, open **Settings → Pages** and set **Source** to **GitHub Actions**.
3. The included workflow, `.github/workflows/pages.yml`, publishes the `public` folder each time you push to `main`. Watch it run under the **Actions** tab.
4. Your site appears at `https://yourname.github.io/exam-desk/`. Add `yourname.github.io` to Firebase's authorized domains.

### Vercel
1. Put the folder on GitHub as above. Steps 2–3 aren't needed for Vercel.
2. Sign in at https://vercel.com with GitHub, click **Add New → Project**, and import the repository.
3. Leave the settings as they are. `vercel.json` already tells Vercel there's no build step and that the site is in `public`. Click **Deploy**.
4. Your site appears at `https://exam-desk.vercel.app` (or a similar name). Add that domain to Firebase's authorized domains.
5. Every push to GitHub redeploys automatically, and pull requests get preview links. Preview addresses are different domains, so sign-in only works on them if you add them too.

### Which to pick

|  | Firebase Hosting | GitHub Pages | Vercel |
|---|---|---|---|
| Cost | Free | Free | Free (Hobby plan, non-commercial) |
| Updating | `firebase deploy` | Push to GitHub | Push to GitHub |
| Extra sign-in setup | None (its domains are pre-approved) | Add domain | Add domain |
| Custom domain | Yes | Yes | Yes |

**Sign-in on other hosts:** the site signs in with a pop-up window. If a browser blocks pop-ups, it falls back to a full-page redirect. On GitHub Pages and Vercel that fallback can fail in browsers that block third-party cookies, such as Safari. Allowing pop-ups for the site fixes it. On Firebase Hosting both ways work.

---

## How saving works

- **Not signed in:** everything saves in the browser only, as before.
- **First sign-in:** whatever is already in that browser is copied to the account.
- **Later sign-ins, on any device:** the account's copy is loaded. The page reloads once so every tool shows it.
- **Changes:** saved to the account about a second after you stop typing.
- **Sign out:** clears that browser's copy, so the next person on a shared or school computer starts fresh. The account keeps everything.
- **Delete my saved data:** this is in the profile panel and needs two taps. It removes the account's document from the database.

What is stored for each student, in one document at `users/<their user ID>`:

- **From Google:** name, email and profile picture link.
- **From the site:** the threshold explorer's marks and choices, the PUM calculator's choices, the countdown setup and paper list, and the light/dark choice.

## Free plan limits

The Spark plan covers a school-sized audience comfortably. The daily limits are roughly:

- 50,000 database reads
- 20,000 writes
- 360 MB of hosting downloads

Check current limits at https://firebase.google.com/pricing. Firebase won't charge you on Spark. It stops serving instead if a limit is reached.

## If something goes wrong

| What you see | Fix |
|---|---|
| No **Sign in** button | `public/firebase-config.js` still has `PASTE_...` values. Fill them in and deploy again. |
| `auth/unauthorized-domain` | Add the domain under Authentication → Settings → Authorized domains. |
| `auth/configuration-not-found` or `operation-not-allowed` | Google isn't switched on under Authentication → Sign-in method. |
| "Couldn't save to your account" or `permission-denied` | Run `firebase deploy` so the rules in `firestore.rules` go live, and check the database exists (step 3). |
| Sign-in window doesn't appear | The browser blocked the pop-up. The site falls back to a full-page sign-in, or you can allow pop-ups for the site. |

## Keeping it up to date

The grade threshold data is inside `public/index.html`. When Cambridge publishes a new series, the data needs adding there, and then you deploy again.
