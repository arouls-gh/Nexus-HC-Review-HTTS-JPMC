# Nexus Health Check Review For HTTS-JPMC-CELL

Web app for reviewing Cisco Nexus health-check outputs before maintenance activities.

## What The App Does

- Uploads a switch parent folder that contains `RESULTS` and `LOGS`
- Reads `RESULTS/*_final_report.txt` or `RESULTS/*_final_report.json`
- Extracts failed health-check blocks
- Builds review feedback for minor, major, and show-stopper findings
- Lets you train the app with past cases
- Stores reusable mapped examples in `data/training-library.json`
- Stores manual check-specific rules in `data/manual-rules.json`

## Project Files

- [index.html](/Users/aroshanm/Documents/New project/index.html): main review page
- [app.js](/Users/aroshanm/Documents/New project/app.js): main review logic
- [past-cases.html](/Users/aroshanm/Documents/New project/past-cases.html): training with past cases
- [train.js](/Users/aroshanm/Documents/New project/train.js): training-page logic
- [manual-rules.html](/Users/aroshanm/Documents/New project/manual-rules.html): manual rule management page
- [manual-rules.js](/Users/aroshanm/Documents/New project/manual-rules.js): manual rule logic
- [server.js](/Users/aroshanm/Documents/New project/server.js): local Node server
- [data/training-library.json](/Users/aroshanm/Documents/New project/data/training-library.json): saved training examples
- [data/manual-rules.json](/Users/aroshanm/Documents/New project/data/manual-rules.json): saved manual rules

## Requirements

- Node.js 18 or later recommended
- Modern browser such as Chrome or Edge

This project currently has no external npm dependencies.

## Local Run

1. Open a terminal in:

```bash
cd "/Users/aroshanm/Documents/New project"
```

2. Start the server:

```bash
npm start
```

3. Open:

[http://127.0.0.1:3000](http://127.0.0.1:3000)

## Main Review Flow

1. Open the main page
2. Choose the maintenance activity
3. Upload the switch parent folder
4. Click `Analyze health check`
5. Review the generated feedback
6. Download the output text file if needed

The uploaded folder should contain:

```text
<hostname>/
  RESULTS/
    <device>_final_report.txt
  LOGS/
    *.xml
```

## Training Flow

Use the training pages to improve feedback reuse over time.

### Past Cases

1. Open [past-cases.html](/Users/aroshanm/Documents/New project/past-cases.html)
2. Paste or upload prior `_final_report.txt` content
3. Paste or upload matching manual feedback
4. Write each feedback item as a bullet point using `*`
5. Auto-map and review uncertain mappings
6. Save mapped training examples

### Manual Rules

1. Open [manual-rules.html](/Users/aroshanm/Documents/New project/manual-rules.html)
2. Add a `checkName`
3. Choose the classification
4. Save a static feedback template

Manual rules take precedence over training-library reuse.

## Data Storage

Tracked in Git:

- [data/training-library.json](/Users/aroshanm/Documents/New project/data/training-library.json)
- [data/manual-rules.json](/Users/aroshanm/Documents/New project/data/manual-rules.json)

Ignored from Git:

- `.DS_Store`
- `data/review-archives/`

## Training Library Format

Saved training examples now store:

- raw feedback in `manualFeedback`
- reusable normalized text in `manualFeedbackTemplate`
- extracted variables in `manualFeedbackVariables`

Examples can include values such as:

- interfaces
- VRFs
- neighbor IPs
- IP addresses
- module IDs
- class maps
- bug IDs
- command tokens
- utilization

## On-Prem VM Notes

For on-prem hosting, a simple first setup is:

1. Install Node.js
2. Clone this Git repository
3. Run `npm start`
4. Expose port `3000` internally or place the app behind a reverse proxy

Good future improvements for VM deployment:

- run the app with `pm2` or `systemd`
- place backups around `data/training-library.json`
- place backups around `data/manual-rules.json`
- front the app with Nginx or Apache if needed

## Git Workflow

Typical update flow:

```bash
git status
git add .
git commit -m "Describe the change"
git push
```
