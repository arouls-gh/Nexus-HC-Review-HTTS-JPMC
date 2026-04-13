# Nexus Health Check Reviewer

Simple client-side website for reviewing Cisco Nexus health-check text files before a maintenance activity.

## Runtime

This app now uses a small local Node server so training data can be saved to disk:

1. Run `node server.js`
2. Open [http://127.0.0.1:3000](http://127.0.0.1:3000)

## What it does

- Upload the parent switch folder named after the hostname.
- Detect lines containing `FAIL`.
- Read `RESULTS/*_final_report.txt` or `RESULTS/*_final_report.json`.
- Use `LOGS/*.xml` as references for deeper detail hints.
- Classify each failed item with a rule-based maintenance impact summary.
- Train the app from a separate page using old device outputs and manual review responses.
- Export the generated review as a new `.txt` file.

## Manual tuning

- Offline feedback wording is centralized in [offline-rules.js](/Users/aroshanm/Documents/New project/offline-rules.js)
- This makes it easier to tune responses check-by-check without changing the parser

## How to run

Because training data is now saved on disk, start the local server first:

1. Run `node /Users/aroshanm/Documents/New project/server.js`
2. Open [http://127.0.0.1:3000](http://127.0.0.1:3000)
2. Choose the maintenance type.
3. Upload the parent switch folder that contains `LOGS` and `RESULTS`.
4. Click `Analyze health check`.
5. Download the generated feedback.

## Training flow

1. Open [train.html](/Users/aroshanm/Documents/New project/train.html)
2. Paste or upload prior `RESULTS/*_final_report.txt` content.
3. Paste or upload the matching manual feedback.
4. Save the training library to the local backend.

## Training storage

- Training examples are saved to [data/training-library.json](/Users/aroshanm/Documents/New project/data/training-library.json)
- This is a stepping stone for cloud migration: the same JSON payload can later be stored in object storage or a database instead of on local disk.

## Notes

- The current parser treats any line containing `FAIL` as a failed health-check item.
- The analysis logic is rule-based and designed to be improved once you provide previous manual review examples or sample health-check outputs.
- Saved example files are stored in browser `localStorage`, so they remain available on the same browser profile.
