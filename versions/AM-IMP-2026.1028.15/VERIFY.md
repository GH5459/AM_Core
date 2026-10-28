# Verify

Run the scripts listed in upgrade.json and check this package with tools/check-upgrade-package.js. Verify a simulated LIFF-restored fragment, a direct fragment retained across navigation, the missing-token case, signer and group authorization, and the absence of tokens from query strings and logs. After deployment, test the existing invitation on the affected Android device without submitting a signature; success in simulated tests alone is not device acceptance.
