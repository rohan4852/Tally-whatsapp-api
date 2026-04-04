# TODO: Remove node_modules from Git permanently

## Steps:
[ ] 1. Confirm no current tracking: `git ls-files | findstr node_modules` (should be empty)
[ ] 2. Install BFG: Download bfg.jar
[ ] 3. Clean history: `java -jar bfg.jar --delete-folders node_modules .`
[ ] 4. Clean refs: `git reflog expire --expire=now --all && git gc --prune=now --aggressive`
[ ] 5. Commit & push: `git push --force --all && git push --force --tags`
[ ] 6. Test: `node index.js` (after `npm install`)
[ ] 7. Mark complete

Note: Backup repo first!