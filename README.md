# 🏎️ RC-Results Club Stats & Analytics Hub

A modern, dark-mode motorsport dashboard for Radio Controlled (RC) car racing clubs. Automatically scrapes race results from [rc-results.com](https://www.rc-results.com), calculates deep driver and club analytics, and serves a static dashboard hosted for free on **GitHub Pages**.

Initially configured for **Mid Devon RC Raceway (`venueId=1119`)**, and built from the ground up to be **100% portable to any RC club** using RC-Timing and `rc-results.com`.

---

## 🌟 Key Features

### 🏁 Driver Career Profiles & Analytics
* **Career Totals**: Total meetings attended, attendance percentage, career A-Final wins, podiums, career A-Final qualification rate (%), and Top Qualifiers (TQs).
* **Personal Bests (PBs)**: Highest finish, best qualifying result, fastest single lap time, best 10-lap average, and best 5-minute race distance/time per class.
* **"The Metronome" Consistency Score**: Quantifies race consistency by calculating the delta between average lap time and personal best lap time.
* **Driver Badges**: Automated achievement awards (*Club Champion, Race Winner, Podium Regular, Pole King, Club Veteran, Track Record Holder, Clean Sweep*).
* **Career Progression Charts**: Interactive charts displaying finish position history and lap time progression across meetings.
* **Full Race Archive**: Filterable meeting-by-meeting history for every driver.

### 🏆 Club & Venue Analytics
* **Club Overview**: Total meetings held, registered drivers, total lifetime laps driven around the track, and total races run.
* **Club Superlatives ("The Record Books")**:
  * **Busiest Meeting**: Peak club attendance and entry count.
  * **Most Laps in a Day**: Highest volume race day.
  * **Closest Finish**: Smallest winning margin in an A-Final (down to hundredths of a second).
* **Official Track Lap Records**: All-time fastest single lap records for each class with driver name, date, and meeting title.
* **Class Popularity Share**: Breakdown of entries across 2WD Buggy, 4WD Buggy, Stadium Trucks, Vintage / Rear Motor, etc.
* **Attendance Trends**: Interactive line chart showing racer attendance over time.

### 🥇 Class Hall of Fame & Leaderboards
* Dedicated leaderboards for every class:
  * All-Time A-Final Wins Leaderboard.
  * All-Time Podiums Leaderboard.
  * Top 10 Fastest Single Laps ever turned in that class.

### ⚔️ Head-to-Head Rivalry Comparison
* Select any two racers to compare:
  * Mutual meetings and direct race results.
  * Head-to-head win ratio and visual comparison bar.
  * Personal best lap comparison.
  * Full breakdown of every race where both drivers competed in the same class and final.

---

## 🚀 Live Local Preview

To preview the dashboard on your local machine:

1. Open your terminal in this project folder:
   ```bash
   cd "D:\RC-Results Scraper"
   ```
2. Start a lightweight local HTTP server:
   ```bash
   python -m http.server 8000 --directory docs
   ```
3. Open your browser to: [http://localhost:8000](http://localhost:8000)

---

## 🤖 Automated Updates via GitHub Actions

The repository includes a ready-to-run GitHub Actions workflow in [`.github/workflows/update-stats.yml`](.github/workflows/update-stats.yml):

* **Automated Weekly Schedule**: Runs automatically every Sunday evening (20:00 UTC) and Monday morning (06:00 UTC) following weekend race meetings.
* **Incremental Scrape**: Checks Page 1 of `VenueMeetings`. If all meetings are already archived, it exits within 2 seconds. If new meetings exist, it scrapes only the new meetings, updates the statistics, commits the changes to Git, and deploys directly to GitHub Pages.
* **Manual Trigger**: You can trigger an immediate update at any time by navigating to **Actions** → **Update RC Stats & Deploy to GitHub Pages** → **Run workflow** in GitHub.

---

## 🛠️ How to Deploy to GitHub Pages

1. **Create a GitHub Repository**:
   * Create a new repository on GitHub (e.g. `rc-stats`).
2. **Push Code to GitHub**:
   ```bash
   git init
   git add .
   git commit -m "feat: initial release of RC-Results stats hub"
   git branch -M main
   git remote add origin https://github.com/<your-username>/<your-repo-name>.git
   git push -u origin main
   ```
3. **Enable GitHub Pages**:
   * Go to **Settings** → **Pages** in your GitHub repository.
   * Under **Build and deployment** → **Source**, select **GitHub Actions**.
   * Run the workflow once (or wait for the scheduled run). Your site will be live at `https://<your-username>.github.io/<your-repo-name>/`!

---

## 🔄 Using This for Another Club (Multi-Club Portability)

Any RC racing club using `rc-results.com` can adopt this dashboard in less than 5 minutes:

1. **Find Your Club's Venue ID**:
   * Visit [rc-results.com](https://www.rc-results.com) and click on your club.
   * Look at the URL in your browser address bar:
     `https://www.rc-results.com/Viewer/Main/VenueMeetings?venueId=XXXX`
   * Copy the number `XXXX` (e.g. `14` for Adur, `19` for Aldershot, `1119` for Mid Devon).
2. **Update `club_config.json`**:
   ```json
   {
     "venueId": XXXX,
     "clubName": "Your Club Name Here",
     "shortName": "YCN",
     "tagline": "Indoor & Outdoor RC Racing Club",
     "website": "https://www.rc-results.com/Viewer/Main/VenueMeetings?venueId=XXXX",
     "trackType": "Off-Road Carpet / Astro",
     "location": "Your Town, Country",
     "primaryColor": "#e11d48",
     "secondaryColor": "#0ea5e9"
   }
   ```
3. **Run a Full Initial Scrape**:
   ```bash
   pip install -r requirements.txt
   python scraper/scraper.py --full
   python scraper/aggregator.py
   ```
4. Commit and push your changes to GitHub. Your club's analytics dashboard is now live and will stay updated automatically!

---

## 📁 Repository Structure

```
├── club_config.json                  # Club configuration (venueId, branding, classes)
├── requirements.txt                  # Python dependencies (requests)
├── scraper/
│   ├── scraper.py                    # Scrapes meetings (supports --incremental and --full)
│   └── aggregator.py                 # Statistics & analytics aggregation engine
├── raw_data/                         # Cached raw meeting JSON files (avoids re-scraping)
│   ├── meetings_index.json           # Catalog of scraped meeting IDs
│   └── meeting_<id>.json             # Detailed race results per meeting
├── docs/                             # Frontend web dashboard (deployed to GitHub Pages)
│   ├── index.html                    # Dark motorsport SPA dashboard
│   ├── css/
│   │   └── dashboard.css             # Dark-mode styling, badges, glassmorphism cards
│   ├── js/
│   │   ├── app.js                    # SPA state management, search, filters, modals
│   │   ├── charts.js                 # Chart.js integration for trends & driver PBs
│   │   └── h2h.js                    # Head-to-Head comparison tool
│   └── data/                         # Processed static JSON files
│       ├── club.json                 # Club records, superlatives, attendance trends
│       ├── drivers.json              # Compact driver index with career stats
│       ├── drivers/                  # Individual driver profile JSONs (<slug>.json)
│       ├── classes.json              # Per-class records, leaderboards, top laps
│       ├── meetings.json             # Chronological meetings archive
│       └── h2h.json                  # Pairwise rivalry matchup records
├── .github/
│   └── workflows/
│       └── update-stats.yml          # GitHub Actions workflow for weekly automation
└── README.md                         # Project documentation
```

---

## 📄 License
Open source for the RC racing community. Data provided by and credited to [rc-results.com](https://www.rc-results.com).
