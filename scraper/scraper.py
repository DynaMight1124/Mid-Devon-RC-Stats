#!/usr/bin/env python3
"""
RC-Results Web Scraper
Scrapes race results from rc-results.com for a configured club venue.
Supports:
  --incremental : Only scrapes new meetings not yet in raw_data/ (default)
  --full        : Scrapes all historical meetings from page 1 to the end
  --meeting-id <id> : Scrapes a specific meeting ID
"""

import os
import sys
import json
import re
import time
import argparse
from typing import Dict, List, Optional, Any
import requests

BASE_URL = "https://www.rc-results.com"
SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
PROJECT_ROOT = os.path.dirname(SCRIPT_DIR)
CONFIG_PATH = os.path.join(PROJECT_ROOT, "club_config.json")
RAW_DATA_DIR = os.path.join(PROJECT_ROOT, "raw_data")
INDEX_PATH = os.path.join(RAW_DATA_DIR, "meetings_index.json")

# User agent for courteous requests
HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
                  "(KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36 RCStatsBot/1.0"
}

def load_config() -> Dict[str, Any]:
    if not os.path.exists(CONFIG_PATH):
        raise FileNotFoundError(f"Config file not found: {CONFIG_PATH}")
    with open(CONFIG_PATH, "r", encoding="utf-8") as f:
        return json.load(f)

def load_meetings_index() -> Dict[str, Any]:
    if os.path.exists(INDEX_PATH):
        try:
            with open(INDEX_PATH, "r", encoding="utf-8") as f:
                return json.load(f)
        except Exception:
            return {"scraped_meetings": {}}
    return {"scraped_meetings": {}}

def save_meetings_index(index_data: Dict[str, Any]):
    os.makedirs(RAW_DATA_DIR, exist_ok=True)
    with open(INDEX_PATH, "w", encoding="utf-8") as f:
        json.dump(index_data, f, indent=2)

def clean_html(text: str) -> str:
    return re.sub(r'<[^>]+>', '', text).strip()

def parse_time_str(time_str: str) -> Optional[float]:
    """Parse lap time string like '14.47' into float seconds."""
    try:
        val = float(time_str.strip())
        return val if val > 0 else None
    except (ValueError, TypeError):
        return None

def parse_result_str(result_str: str) -> Dict[str, Any]:
    """Parse race result like '19 / 305.07' into laps and total seconds."""
    parts = result_str.split("/")
    if len(parts) == 2:
        try:
            laps = int(parts[0].strip())
            sec = float(parts[1].strip())
            return {"laps": laps, "total_seconds": sec, "raw": result_str.strip()}
        except ValueError:
            pass
    return {"laps": 0, "total_seconds": 0.0, "raw": result_str.strip()}

class RCResultsScraper:
    def __init__(self, venue_id: int):
        self.venue_id = venue_id
        self.session = requests.Session()
        self.session.headers.update(HEADERS)

    def get_venue_meetings_page(self, page: int = 1) -> List[Dict[str, Any]]:
        """Fetch list of meetings from a given venue page."""
        url = f"{BASE_URL}/Viewer/Main/VenueMeetings?venueId={self.venue_id}&page={page}"
        print(f"[Scraper] Fetching meeting catalog page {page}...")
        resp = self.session.get(url, timeout=20)
        if resp.status_code != 200:
            print(f"[Scraper] HTTP error {resp.status_code} for {url}")
            return []
        
        html = resp.text
        # Matches: <a href="/Viewer/Main/MeetingSummary?meetingId=18948">01-Mar-2026</a>
        # and:     <a href="/Viewer/Main/MeetingSummary?meetingId=18948">25/26 Winter Series Round 5</a>
        pattern = r'href="\/Viewer\/Main\/MeetingSummary\?meetingId=(\d+)">([^<]+)<\/a><\/td>\s*<td><a[^>]+>([^<]+)<\/a>'
        matches = re.findall(pattern, html)
        
        meetings = []
        for mid, date, title in matches:
            meetings.append({
                "meetingId": int(mid),
                "date": date.strip(),
                "title": title.strip()
            })
        return meetings

    def get_all_venue_meetings(self) -> List[Dict[str, Any]]:
        """Fetch all historical meetings across all pages."""
        all_meetings = []
        page = 1
        while True:
            meetings = self.get_venue_meetings_page(page)
            if not meetings:
                break
            all_meetings.extend(meetings)
            # Check if there is another page
            url = f"{BASE_URL}/Viewer/Main/VenueMeetings?venueId={self.venue_id}&page={page}"
            resp = self.session.get(url, timeout=20)
            if f"page={page + 1}" not in resp.text:
                break
            page += 1
            time.sleep(0.2)
        return all_meetings

    def scrape_meeting(self, meeting_id: int, date: str, title: str) -> Dict[str, Any]:
        """Scrapes full meeting details including qualifying, finals, and races."""
        summary_url = f"{BASE_URL}/Viewer/Main/MeetingSummary?meetingId={meeting_id}"
        print(f"[Scraper] Scraping meeting {meeting_id} ({date} - {title})...")
        resp = self.session.get(summary_url, timeout=20)
        if resp.status_code != 200:
            raise RuntimeError(f"Failed to fetch summary for meeting {meeting_id}: HTTP {resp.status_code}")
        
        html = resp.text
        
        # 1. Parse all listings
        listings = re.findall(r'href="\/Viewer\/Main\/Listing\?listingId=(\d+)">([^<]+)<\/a>', html)
        
        # Identify Qualifying listings
        qual_listings = [(lid, name.strip()) for lid, name in listings if "Qualifying" in name]
        latest_qual_id = qual_listings[-1][0] if qual_listings else None
        
        # Identify Finals listing
        finals_overall_listings = [(lid, name.strip()) for lid, name in listings if "Finals - Overall Results" in name]
        finals_listing_id = finals_overall_listings[0][0] if finals_overall_listings else None

        # 2. Extract final races and qualifying races from MeetingSummary
        final_races = re.findall(r'href="\/Viewer\/Main\/RaceResult\?raceId=(\d+)">([^<]*Final[^<]*)<\/a>', html, re.IGNORECASE)
        qual_races = re.findall(r'href="\/Viewer\/Main\/RaceResult\?raceId=(\d+)">([^<]*Race \d+ - (?!.*Final)[^<]*)<\/a>', html, re.IGNORECASE)

        # 3. Parse Qualifying Standings
        qualifying_standings = []
        if latest_qual_id:
            qualifying_standings = self._parse_qualifying_listing(latest_qual_id)

        # 4. Parse Finals Results
        finals_results = []
        if finals_listing_id:
            finals_results = self._parse_finals_listing(finals_listing_id)
        elif final_races:
            # Fallback: scrape individual final race result pages
            finals_results = self._parse_individual_final_races(final_races)

        # 5. Parse Qualifying Race Results for complete lap times & best laps
        heat_results = self._parse_heat_races(qual_races)

        meeting_data = {
            "id": meeting_id,
            "date": date,
            "title": title,
            "venue_id": self.venue_id,
            "scraped_at": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
            "qualifying": qualifying_standings,
            "finals": finals_results,
            "heats": heat_results,
            "stats": {
                "total_finals": len(finals_results),
                "total_heat_entries": len(heat_results)
            }
        }
        return meeting_data

    def _parse_finals_listing(self, listing_id: str) -> List[Dict[str, Any]]:
        """Parses consolidated Finals - Overall Results listing."""
        url = f"{BASE_URL}/Viewer/Main/Listing?listingId={listing_id}"
        resp = self.session.get(url, timeout=20)
        if resp.status_code != 200:
            return []
        
        html = resp.text
        sections = re.findall(r'<h3>([^<]+)</h3>\s*<h4></h4>\s*<div>\s*<table[^>]*>(.*?)</table>', html, re.DOTALL)
        
        finals = []
        for section_title, table_html in sections:
            # e.g. "Stadium Trucks - A Final" or "2WD - B Final"
            parts = section_title.strip().split(" - ")
            class_name = parts[0].strip() if len(parts) > 1 else section_title.strip()
            final_name = parts[1].strip() if len(parts) > 1 else "A Final"
            
            rows = re.findall(r'<tr>(.*?)</tr>', table_html, re.DOTALL)
            for r in rows:
                cols = re.findall(r'<td[^>]*>(?:<text[^>]*>)?(.*?)(?:</text>)?</td>', r, re.DOTALL)
                if len(cols) >= 7:
                    pos = clean_html(cols[0])
                    car = clean_html(cols[1])
                    name = clean_html(cols[2])
                    result_raw = clean_html(cols[3])
                    ave_raw = clean_html(cols[4])
                    best10_raw = clean_html(cols[5])
                    best_raw = clean_html(cols[6])
                    
                    if not name or name == "Name":
                        continue
                    
                    res_parsed = parse_result_str(result_raw)
                    finals.append({
                        "class": class_name,
                        "final": final_name,
                        "position": int(pos) if pos.isdigit() else pos,
                        "car": int(car) if car.isdigit() else car,
                        "driver": name,
                        "laps": res_parsed["laps"],
                        "total_seconds": res_parsed["total_seconds"],
                        "result_str": result_raw,
                        "average_lap": parse_time_str(ave_raw),
                        "best10": parse_time_str(best10_raw),
                        "best_lap": parse_time_str(best_raw)
                    })
        return finals

    def _parse_individual_final_races(self, final_races: List[tuple]) -> List[Dict[str, Any]]:
        """Parses individual final race pages when consolidated listing is not present."""
        finals = []
        for race_id, race_title in final_races:
            time.sleep(0.05)
            url = f"{BASE_URL}/Viewer/Main/RaceResult?raceId={race_id}"
            resp = self.session.get(url, timeout=15)
            if resp.status_code != 200:
                continue
            
            # e.g. "Race 7 - 2wd - A Final"
            parts = race_title.split(" - ")
            class_name = parts[1].strip() if len(parts) >= 2 else "Open"
            final_name = parts[2].strip() if len(parts) >= 3 else "A Final"
            
            # Standardize class name casing
            if class_name.lower() == "2wd":
                class_name = "2WD"
            elif class_name.lower() == "4wd":
                class_name = "4WD"
            elif "vintage" in class_name.lower():
                class_name = "Vintage/Rear Motor"
            
            html = resp.text
            rows = re.findall(r'<tr>(.*?)</tr>', html, re.DOTALL)
            for r in rows:
                cols = re.findall(r'<td[^>]*>(.*?)</td>', r, re.DOTALL)
                cols_clean = [clean_html(c) for c in cols]
                if len(cols_clean) >= 6:
                    pos = cols_clean[0]
                    car = cols_clean[1]
                    name = cols_clean[2]
                    result_raw = cols_clean[3]
                    best10_raw = cols_clean[4]
                    best_raw = cols_clean[5]
                    
                    if not name or name == "Driver":
                        continue
                    
                    res_parsed = parse_result_str(result_raw)
                    finals.append({
                        "class": class_name,
                        "final": final_name,
                        "position": int(pos) if pos.isdigit() else pos,
                        "car": int(car) if car.isdigit() else car,
                        "driver": name,
                        "laps": res_parsed["laps"],
                        "total_seconds": res_parsed["total_seconds"],
                        "result_str": result_raw,
                        "average_lap": round(res_parsed["total_seconds"] / res_parsed["laps"], 2) if res_parsed["laps"] > 0 else None,
                        "best10": parse_time_str(best10_raw),
                        "best_lap": parse_time_str(best_raw)
                    })
        return finals

    def _parse_qualifying_listing(self, listing_id: str) -> List[Dict[str, Any]]:
        """Parses the overall qualifying standings table."""
        url = f"{BASE_URL}/Viewer/Main/Listing?listingId={listing_id}"
        resp = self.session.get(url, timeout=20)
        if resp.status_code != 200:
            return []
        
        html = resp.text
        sections = re.findall(r'<h3>([^<]+)</h3>\s*<h4></h4>\s*<div>\s*<table[^>]*>(.*?)</table>', html, re.DOTALL)
        
        quals = []
        for section_title, table_html in sections:
            class_name = section_title.strip()
            if class_name.lower() == "2wd":
                class_name = "2WD"
            elif class_name.lower() == "4wd":
                class_name = "4WD"
            elif "vintage" in class_name.lower():
                class_name = "Vintage/Rear Motor"

            rows = re.findall(r'<tr>(.*?)</tr>', table_html, re.DOTALL)
            for r in rows:
                cols = re.findall(r'<td[^>]*>(?:<text[^>]*>)?(.*?)(?:</text>)?</td>', r, re.DOTALL)
                if len(cols) >= 3:
                    pos = clean_html(cols[0])
                    name = clean_html(cols[1])
                    best_run = clean_html(cols[2])
                    
                    if not name or name == "Name":
                        continue
                    
                    res_parsed = parse_result_str(best_run)
                    quals.append({
                        "class": class_name,
                        "position": int(pos) if pos.isdigit() else pos,
                        "driver": name,
                        "best_run": best_run,
                        "best_laps": res_parsed["laps"],
                        "best_seconds": res_parsed["total_seconds"]
                    })
        return quals

    def _parse_heat_races(self, qual_races: List[tuple]) -> List[Dict[str, Any]]:
        """Parses individual qualifying heat race pages for full lap times & best laps."""
        heats = []
        for race_id, race_title in qual_races:
            time.sleep(0.04)
            url = f"{BASE_URL}/Viewer/Main/RaceResult?raceId={race_id}"
            resp = self.session.get(url, timeout=15)
            if resp.status_code != 200:
                continue
            
            # e.g. "Race 6 - 2WD"
            parts = race_title.split(" - ")
            class_name = parts[1].strip() if len(parts) >= 2 else "Open"
            if class_name.lower() == "2wd":
                class_name = "2WD"
            elif class_name.lower() == "4wd":
                class_name = "4WD"
            elif "vintage" in class_name.lower():
                class_name = "Vintage/Rear Motor"

            html = resp.text
            rows = re.findall(r'<tr>(.*?)</tr>', html, re.DOTALL)
            for r in rows:
                cols = re.findall(r'<td[^>]*>(.*?)</td>', r, re.DOTALL)
                cols_clean = [clean_html(c) for c in cols]
                if len(cols_clean) >= 6:
                    pos = cols_clean[0]
                    name = cols_clean[2]
                    result_raw = cols_clean[3]
                    best10_raw = cols_clean[4]
                    best_raw = cols_clean[5]
                    
                    if not name or name == "Driver":
                        continue
                    
                    res_parsed = parse_result_str(result_raw)
                    heats.append({
                        "class": class_name,
                        "driver": name,
                        "heat_title": race_title,
                        "laps": res_parsed["laps"],
                        "total_seconds": res_parsed["total_seconds"],
                        "best10": parse_time_str(best10_raw),
                        "best_lap": parse_time_str(best_raw)
                    })
        return heats


def run_scraper(mode: str = "incremental", specific_id: Optional[int] = None):
    config = load_config()
    venue_id = config.get("venueId", 1119)
    scraper = RCResultsScraper(venue_id)
    
    os.makedirs(RAW_DATA_DIR, exist_ok=True)
    index = load_meetings_index()
    scraped_map = index.get("scraped_meetings", {})

    if specific_id:
        meetings_to_scrape = [{"meetingId": specific_id, "date": "Manual", "title": f"Meeting {specific_id}"}]
    elif mode == "full":
        print(f"[Scraper] Mode: FULL BACKFILL for venueId {venue_id}...")
        all_meetings = scraper.get_all_venue_meetings()
        meetings_to_scrape = all_meetings
    else:
        print(f"[Scraper] Mode: INCREMENTAL CHECK for venueId {venue_id}...")
        # Check first page
        page1 = scraper.get_venue_meetings_page(1)
        new_meetings = [m for m in page1 if str(m["meetingId"]) not in scraped_map]
        if not new_meetings:
            print("[Scraper] All meetings on page 1 are already scraped. Everything is up to date!")
            return
        print(f"[Scraper] Found {len(new_meetings)} new meeting(s) to scrape!")
        meetings_to_scrape = new_meetings

    print(f"[Scraper] Total meetings to process: {len(meetings_to_scrape)}")
    for m in meetings_to_scrape:
        mid = m["meetingId"]
        date = m["date"]
        title = m["title"]
        file_path = os.path.join(RAW_DATA_DIR, f"meeting_{mid}.json")
        
        try:
            meeting_data = scraper.scrape_meeting(mid, date, title)
            with open(file_path, "w", encoding="utf-8") as f:
                json.dump(meeting_data, f, indent=2)
            
            scraped_map[str(mid)] = {
                "date": date,
                "title": title,
                "scraped_at": meeting_data["scraped_at"]
            }
            index["scraped_meetings"] = scraped_map
            save_meetings_index(index)
            print(f"[Scraper] Successfully saved {file_path}")
        except Exception as e:
            print(f"[Scraper] Error scraping meeting {mid}: {e}")
        
        time.sleep(0.5)

    print("[Scraper] Scraping complete!")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="RC-Results Scraper")
    parser.add_argument("--full", action="store_true", help="Scrape all historical meetings")
    parser.add_argument("--incremental", action="store_true", help="Only scrape new meetings (default)")
    parser.add_argument("--meeting-id", type=int, help="Scrape a single specific meeting ID")
    args = parser.parse_args()

    mode = "full" if args.full else "incremental"
    run_scraper(mode=mode, specific_id=args.meeting_id)
