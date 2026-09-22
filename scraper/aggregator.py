#!/usr/bin/env python3
"""
RC-Results Analytics & Aggregation Engine
Processes raw meeting JSON files and computes:
- Club overview, superlatives, and attendance trends
- Per-class leaderboards and all-time lap records
- Driver career statistics, personal bests, progression, and badges
- Chronological meetings archive
- Pairwise head-to-head match records
Outputs static JSON files to docs/data/ for the frontend dashboard.
"""

import os
import sys
import json
import re
from html import unescape
from collections import defaultdict
from typing import Dict, List, Any, Optional

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
PROJECT_ROOT = os.path.dirname(SCRIPT_DIR)
CONFIG_PATH = os.path.join(PROJECT_ROOT, "club_config.json")
RAW_DATA_DIR = os.path.join(PROJECT_ROOT, "raw_data")
DOCS_DATA_DIR = os.path.join(PROJECT_ROOT, "docs", "data")
DRIVERS_DIR = os.path.join(DOCS_DATA_DIR, "drivers")

def load_config() -> Dict[str, Any]:
    with open(CONFIG_PATH, "r", encoding="utf-8") as f:
        return json.load(f)

def slugify(name: str) -> str:
    slug = name.strip().lower()
    slug = re.sub(r'[^a-z0-9]+', '-', slug)
    return slug.strip('-')

def extract_season(meeting_title: str, date_str: str) -> str:
    """Extract season from meeting title (e.g. '25/26 Winter Series Round 5') or date."""
    match = re.search(r'(\d{2}\/\d{2})', meeting_title)
    if match:
        return match.group(1)
    # Fallback to year from date: e.g. "01-Oct-2023"
    match_year = re.search(r'20(\d{2})', date_str)
    if match_year:
        yr = int(match_year.group(1))
        return f"{yr-1}/{yr}"
    return "Open"

def normalize_class_name(raw_name: str, class_aliases: Optional[Dict[str, str]] = None) -> str:
    if not raw_name:
        return "Open"
    name = unescape(raw_name).strip()
    # Strip leading/trailing angle brackets if present e.g. <Trucks + 4wd> -> Trucks + 4wd
    if name.startswith('<') and name.endswith('>'):
        name = name[1:-1].strip()
    name = re.sub(r'\s+', ' ', name).strip()

    # 1. Custom club-configured aliases from club_config.json
    if class_aliases:
        if name in class_aliases:
            return class_aliases[name]
        nl = name.lower()
        for k, v in class_aliases.items():
            if k.lower() == nl:
                return v

    # 2. General smart defaults
    nl = name.lower()
    if nl in ("2wd", "2 wd", "2wd buggy"):
        return "2WD Buggy"
    if nl in ("4wd", "4 wd", "4wd buggy"):
        return "4WD Buggy"
    if "stadium" in nl or ("truck" in nl and "4wd" not in nl):
        return "Stadium Trucks"
    if "truck" in nl and "4wd" in nl:
        return "Stadium Trucks"
    if "vintage" in nl or "rear" in nl:
        return "Vintage / Rear Motor"
    return name

def safe_int_pos(val: Any) -> int:
    if isinstance(val, int):
        return val
    if isinstance(val, str):
        val_clean = re.sub(r'[^\d]', '', val)
        if val_clean.isdigit():
            return int(val_clean)
    return 999

def final_rank_order(final_name: str, position: Any) -> int:
    """Calculates overall order for ranking. A Final 1 = 1, A Final 2 = 2... B Final 1 = 11, etc."""
    fn = final_name.upper().strip()
    letter_match = re.search(r'([A-Z])\s*FINAL', fn)
    letter = letter_match.group(1) if letter_match else 'A'
    offset = (ord(letter) - ord('A')) * 10
    pos_num = safe_int_pos(position)
    return offset + pos_num

class StatsAggregator:
    def __init__(self):
        self.config = load_config()
        self.class_aliases = self.config.get("classAliases", {})
        self.raw_meetings = []
        self.drivers = defaultdict(lambda: {
            "name": "",
            "slug": "",
            "classes": set(),
            "meetings_attended": set(),
            "a_final_meetings": set(),
            "a_final_positions": [],
            "a_finals_by_class": defaultdict(int),
            "total_races": 0,
            "total_laps": 0,
            "total_race_seconds": 0.0,
            "a_final_wins": 0,
            "a_final_podiums": 0,
            "a_final_appearances": 0,
            "tqs": 0,
            "other_final_wins": 0,
            "best_laps": {},         # class -> min best lap
            "best_runs": {},         # class -> max laps, min time
            "best10": {},            # class -> min best10
            "highest_finishes": {},  # class -> {"final": str, "pos": int, "rank": int}
            "highest_quals": {},     # class -> int
            "timeline": [],          # list of event participation records
            "lap_deltas": []         # (ave_lap - best_lap) for consistency calculation
        })
        self.classes = defaultdict(lambda: {
            "name": "",
            "lap_records": [],       # list of all laps recorded
            "wins": defaultdict(int),
            "podiums": defaultdict(int),
            "tqs": defaultdict(int),
            "a_finals": defaultdict(int),
            "entries_count": 0
        })
        self.meetings_summary = []
        self.h2h_matches = defaultdict(lambda: defaultdict(lambda: {"wins_a": 0, "wins_b": 0, "meetings": 0}))

    def load_all_raw_meetings(self):
        if not os.path.exists(RAW_DATA_DIR):
            print(f"[Aggregator] No raw_data directory found at {RAW_DATA_DIR}")
            return
        
        files = [f for f in os.listdir(RAW_DATA_DIR) if f.startswith("meeting_") and f.endswith(".json")]
        print(f"[Aggregator] Loading {len(files)} raw meeting files...")
        
        venue_id = self.config.get("venueId")
        skipped_venue_count = 0

        for f in files:
            path = os.path.join(RAW_DATA_DIR, f)
            with open(path, "r", encoding="utf-8") as jf:
                try:
                    data = json.load(jf)
                    m_venue = data.get("venue_id")
                    if venue_id and m_venue and m_venue != venue_id:
                        skipped_venue_count += 1
                        continue
                    self.raw_meetings.append(data)
                except Exception as e:
                    print(f"[Aggregator] Error reading {path}: {e}")

        if skipped_venue_count > 0:
            print(f"[Aggregator] Notice: Skipped {skipped_venue_count} meeting file(s) from different venue(s).")

        # Sort meetings chronologically (by meeting ID or date)
        self.raw_meetings.sort(key=lambda m: m["id"])

    def process(self):
        print("[Aggregator] Processing raw meeting data...")
        total_lifetime_laps = 0
        total_lifetime_races = 0
        meeting_lap_totals = {}
        closest_finishes = []

        for m in self.raw_meetings:
            mid = m["id"]
            date = m["date"]
            title = m["title"]
            season = extract_season(title, date)
            
            meeting_drivers = set()
            meeting_laps = 0
            meeting_races_count = 0
            meeting_fastest_lap = {"time": 999.0, "driver": None, "class": None}
            class_winners = {}
            class_tqs = {}

            # 1. Process Qualifying
            for q in m.get("qualifying", []):
                driver_name = q["driver"].strip()
                if not driver_name:
                    continue
                cls_name = normalize_class_name(q["class"], self.class_aliases)
                q_pos = safe_int_pos(q["position"])
                meeting_drivers.add(driver_name)
                
                # Check for TQ
                if q_pos == 1:
                    class_tqs[cls_name] = driver_name
                    self.drivers[driver_name]["tqs"] += 1
                    self.classes[cls_name]["tqs"][driver_name] += 1
                
                # Update driver qualifying PB
                d = self.drivers[driver_name]
                if cls_name not in d["highest_quals"] or q_pos < d["highest_quals"][cls_name]:
                    d["highest_quals"][cls_name] = q_pos

            # 2. Process Qualifying Heats (for lap counts and fastest heat laps)
            for h in m.get("heats", []):
                driver_name = h["driver"].strip()
                if not driver_name:
                    continue
                cls_name = normalize_class_name(h["class"], self.class_aliases)
                laps = h.get("laps", 0)
                sec = h.get("total_seconds", 0.0)
                best_lap = h.get("best_lap")
                best10 = h.get("best10")

                meeting_drivers.add(driver_name)
                meeting_laps += laps
                meeting_races_count += 1
                total_lifetime_laps += laps
                total_lifetime_races += 1

                d = self.drivers[driver_name]
                d["total_races"] += 1
                d["total_laps"] += laps
                d["total_race_seconds"] += sec
                d["classes"].add(cls_name)

                if best_lap and best_lap > 5.0 and best_lap < 90.0:
                    # Update driver PB for this class
                    if cls_name not in d["best_laps"] or best_lap < d["best_laps"][cls_name]:
                        d["best_laps"][cls_name] = best_lap
                    # Update class lap records
                    self.classes[cls_name]["lap_records"].append({
                        "lap_time": best_lap,
                        "driver": driver_name,
                        "date": date,
                        "meeting_title": title,
                        "meeting_id": mid,
                        "session": "Heat"
                    })
                    # Track meeting fastest
                    if best_lap < meeting_fastest_lap["time"]:
                        meeting_fastest_lap = {"time": best_lap, "driver": driver_name, "class": cls_name}

                if best10 and best10 > 5.0:
                    if cls_name not in d["best10"] or best10 < d["best10"][cls_name]:
                        d["best10"][cls_name] = best10

            # 3. Process Finals
            # Group finals by class and final name for H2H and closest finish analysis
            finals_by_group = defaultdict(list)
            for f in m.get("finals", []):
                driver_name = f["driver"].strip()
                if not driver_name:
                    continue
                cls_name = normalize_class_name(f["class"], self.class_aliases)
                final_name = f.get("final", "A Final").strip()
                pos = safe_int_pos(f.get("position", 1))
                laps = f.get("laps", 0)
                sec = f.get("total_seconds", 0.0)
                best_lap = f.get("best_lap")
                ave_lap = f.get("average_lap")
                best10 = f.get("best10")

                meeting_drivers.add(driver_name)
                meeting_laps += laps
                meeting_races_count += 1
                total_lifetime_laps += laps
                total_lifetime_races += 1
                self.classes[cls_name]["entries_count"] += 1

                d = self.drivers[driver_name]
                d["name"] = driver_name
                d["slug"] = slugify(driver_name)
                d["meetings_attended"].add(mid)
                d["total_races"] += 1
                d["total_laps"] += laps
                d["total_race_seconds"] += sec
                d["classes"].add(cls_name)

                # Consistency tracking
                if ave_lap and best_lap and ave_lap >= best_lap:
                    delta = ave_lap - best_lap
                    d["lap_deltas"].append(delta)

                is_a_final = "A" in final_name.upper().split() or final_name.upper() == "A FINAL"

                if is_a_final:
                    d["a_final_appearances"] += 1
                    d["a_final_meetings"].add(mid)
                    d["a_finals_by_class"][cls_name] += 1
                    self.classes[cls_name]["a_finals"][driver_name] += 1
                    if isinstance(pos, int):
                        d["a_final_positions"].append(pos)
                    if pos == 1:
                        d["a_final_wins"] += 1
                        self.classes[cls_name]["wins"][driver_name] += 1
                        class_winners[cls_name] = {
                            "driver": driver_name,
                            "laps": laps,
                            "seconds": sec,
                            "result": f.get("result_str", f"{laps} / {sec:.2f}")
                        }
                    if pos in (1, 2, 3):
                        d["a_final_podiums"] += 1
                        self.classes[cls_name]["podiums"][driver_name] += 1
                else:
                    if pos == 1:
                        d["other_final_wins"] += 1

                # Update Highest Finish PB
                rank = final_rank_order(final_name, pos)
                if cls_name not in d["highest_finishes"] or rank < d["highest_finishes"][cls_name]["rank"]:
                    d["highest_finishes"][cls_name] = {
                        "final": final_name,
                        "position": pos,
                        "rank": rank,
                        "meeting_date": date,
                        "meeting_title": title
                    }

                # Update Best 5-minute Run PB
                if laps > 0 and sec > 0:
                    current_best = d["best_runs"].get(cls_name)
                    if not current_best or laps > current_best["laps"] or (laps == current_best["laps"] and sec < current_best["seconds"]):
                        d["best_runs"][cls_name] = {
                            "laps": laps,
                            "seconds": sec,
                            "result_str": f.get("result_str", f"{laps} / {sec:.2f}"),
                            "meeting_date": date
                        }

                # Lap records
                if best_lap and best_lap > 5.0 and best_lap < 90.0:
                    if cls_name not in d["best_laps"] or best_lap < d["best_laps"][cls_name]:
                        d["best_laps"][cls_name] = best_lap
                    self.classes[cls_name]["lap_records"].append({
                        "lap_time": best_lap,
                        "driver": driver_name,
                        "date": date,
                        "meeting_title": title,
                        "meeting_id": mid,
                        "session": final_name
                    })
                    if best_lap < meeting_fastest_lap["time"]:
                        meeting_fastest_lap = {"time": best_lap, "driver": driver_name, "class": cls_name}

                if best10 and best10 > 5.0:
                    if cls_name not in d["best10"] or best10 < d["best10"][cls_name]:
                        d["best10"][cls_name] = best10

                # Add to driver meeting timeline
                d["timeline"].append({
                    "meeting_id": mid,
                    "date": date,
                    "title": title,
                    "season": season,
                    "class": cls_name,
                    "final": final_name,
                    "position": pos,
                    "laps": laps,
                    "total_seconds": sec,
                    "best_lap": best_lap,
                    "average_lap": ave_lap,
                    "best10": best10
                })

                finals_by_group[(cls_name, final_name)].append(f)

            # Analyze H2H and Closest Finish within this meeting
            for (cname, fname), racers in finals_by_group.items():
                if len(racers) >= 2:
                    # Sort racers by position
                    racers_sorted = sorted(racers, key=lambda r: safe_int_pos(r.get("position")))
                    # Closest finish check (A Final 1st vs 2nd)
                    if "A" in fname.upper():
                        r1 = racers_sorted[0]
                        r2 = racers_sorted[1]
                        if r1.get("laps") == r2.get("laps") and r1.get("total_seconds") and r2.get("total_seconds"):
                            margin = abs(r2["total_seconds"] - r1["total_seconds"])
                            if margin > 0.01:
                                closest_finishes.append({
                                    "margin": round(margin, 2),
                                    "class": cname,
                                    "final": fname,
                                    "winner": r1["driver"],
                                    "runner_up": r2["driver"],
                                    "winner_result": r1.get("result_str"),
                                    "runner_up_result": r2.get("result_str"),
                                    "meeting_date": date,
                                    "meeting_title": title
                                })

                    # Head-to-Head pairwise
                    for i in range(len(racers_sorted)):
                        for j in range(i + 1, len(racers_sorted)):
                            d1 = racers_sorted[i]["driver"]
                            d2 = racers_sorted[j]["driver"]
                            # d1 finished ahead of d2
                            pair_key = tuple(sorted([d1, d2]))
                            m_stat = self.h2h_matches[pair_key[0]][pair_key[1]]
                            m_stat["meetings"] += 1
                            if d1 == pair_key[0]:
                                m_stat["wins_a"] += 1
                            else:
                                m_stat["wins_b"] += 1

            # Summary for this meeting
            meeting_lap_totals[mid] = meeting_laps
            # Register meeting attendance and slug for all participating drivers
            for dname in meeting_drivers:
                d = self.drivers[dname]
                d["name"] = dname
                d["slug"] = slugify(dname)
                d["meetings_attended"].add(mid)

            self.meetings_summary.append({
                "id": mid,
                "date": date,
                "title": title,
                "season": season,
                "drivers_count": len(meeting_drivers),
                "total_laps": meeting_laps,
                "races_count": meeting_races_count,
                "winners": class_winners,
                "tqs": class_tqs,
                "fastest_lap": meeting_fastest_lap if meeting_fastest_lap["driver"] else None
            })

        # Calculate superlatives
        busiest_meeting = max(self.meetings_summary, key=lambda m: m["drivers_count"], default=None)
        most_laps_meeting = max(self.meetings_summary, key=lambda m: m["total_laps"], default=None)
        most_races_meeting = max(self.meetings_summary, key=lambda m: m["races_count"], default=None)
        closest_finish = min(closest_finishes, key=lambda c: c["margin"], default=None)

        # Build Club Overview Data
        total_meetings = len(self.meetings_summary)
        unique_drivers_count = len(self.drivers)
        
        # Sort lap records per class to get all-time records
        class_records = {}
        for cname, cdata in self.classes.items():
            records = cdata["lap_records"]
            records.sort(key=lambda r: r["lap_time"])
            top_10 = records[:10]
            record_holder = records[0] if records else None
            
            # Sort winners
            sorted_winners = sorted(cdata["wins"].items(), key=lambda x: x[1], reverse=True)
            sorted_podiums = sorted(cdata["podiums"].items(), key=lambda x: x[1], reverse=True)
            sorted_tqs = sorted(cdata["tqs"].items(), key=lambda x: x[1], reverse=True)
            sorted_afinals = sorted(cdata["a_finals"].items(), key=lambda x: x[1], reverse=True)

            class_records[cname] = {
                "name": cname,
                "entries_count": cdata["entries_count"],
                "lap_record": record_holder,
                "top_laps": top_10,
                "leaderboard_wins": [{"driver": d, "wins": w} for d, w in sorted_winners if w > 0],
                "leaderboard_podiums": [{"driver": d, "podiums": p} for d, p in sorted_podiums if p > 0],
                "leaderboard_tqs": [{"driver": d, "tqs": t} for d, t in sorted_tqs if t > 0],
                "leaderboard_afinals": [{"driver": d, "a_finals": a} for d, a in sorted_afinals if a > 0]
            }

        # Build Club JSON
        club_data = {
            "config": self.config,
            "stats": {
                "total_meetings": total_meetings,
                "total_unique_drivers": unique_drivers_count,
                "total_laps_driven": total_lifetime_laps,
                "total_races_run": total_lifetime_races
            },
            "superlatives": {
                "busiest_meeting": busiest_meeting,
                "most_laps_meeting": most_laps_meeting,
                "most_races_meeting": most_races_meeting,
                "closest_finish": closest_finish
            },
            "attendance_trend": [
                {
                    "id": m["id"],
                    "date": m["date"],
                    "title": m["title"],
                    "season": m["season"],
                    "drivers": m["drivers_count"],
                    "laps": m["total_laps"]
                }
                for m in self.meetings_summary
            ],
            "class_lap_records": {
                cname: cdata["lap_record"] for cname, cdata in class_records.items() if cdata["lap_record"]
            }
        }

        # Build Driver Profiles and Badges
        drivers_index = []
        # Clean out old driver profile JSONs to avoid stale/orphaned files from previous clubs
        if os.path.exists(DRIVERS_DIR):
            for f in os.listdir(DRIVERS_DIR):
                if f.endswith(".json"):
                    try:
                        os.remove(os.path.join(DRIVERS_DIR, f))
                    except OSError:
                        pass
        os.makedirs(DRIVERS_DIR, exist_ok=True)

        for dname, d in self.drivers.items():
            if not dname:
                continue
            
            slug = d["slug"] or slugify(dname)
            if not slug:
                continue
            d["slug"] = slug
            m_count = len(d["meetings_attended"])
            attendance_pct = round((m_count / total_meetings) * 100, 1) if total_meetings > 0 else 0
            a_final_pct = round((len(d["a_final_meetings"]) / m_count) * 100, 1) if m_count > 0 else 0
            
            # Consistency Metronome
            metronome = None
            if d["lap_deltas"]:
                metronome = round(sum(d["lap_deltas"]) / len(d["lap_deltas"]), 2)

            # Badges
            badges = []
            if d["a_final_wins"] >= 3:
                badges.append({"id": "champion", "label": "Multi-Winner", "icon": "trophy", "desc": "Won 3+ A-Finals"})
            elif d["a_final_wins"] >= 1:
                badges.append({"id": "winner", "label": "Race Winner", "icon": "medal", "desc": "Won an A-Final"})
            
            if d["a_final_podiums"] >= 5:
                badges.append({"id": "podium_master", "label": "Podium Regular", "icon": "award", "desc": "5+ A-Final Podiums"})
            
            if d["tqs"] >= 2:
                badges.append({"id": "pole_king", "label": "Pole King", "icon": "target", "desc": "2+ Top Qualifiers (TQ)"})
            
            if attendance_pct >= 70:
                badges.append({"id": "ironman", "label": "Club Veteran", "icon": "shield", "desc": f"Attended {attendance_pct}% of meetings"})
            
            if len(d["classes"]) >= 2:
                badges.append({"id": "multi_class", "label": "Multi-Class", "icon": "shuffle", "desc": "Competes in multiple classes"})

            # Check if holds class lap record
            for cname, cinfo in class_records.items():
                if cinfo.get("lap_record") and cinfo["lap_record"]["driver"] == dname:
                    badges.append({"id": "record_holder", "label": f"{cname} Record", "icon": "zap", "desc": f"Holds track record for {cname} ({cinfo['lap_record']['lap_time']}s)"})

            # Check for Clean Sweep in any single meeting (TQ + Win in same meeting)
            clean_sweep = False
            for m_item in self.meetings_summary:
                for cls, winner in m_item.get("winners", {}).items():
                    if winner.get("driver") == dname:
                        tq_driver = m_item.get("tqs", {}).get(cls)
                        if tq_driver == dname:
                            clean_sweep = True
                            break
            if clean_sweep:
                badges.append({"id": "clean_sweep", "label": "Clean Sweep", "icon": "sparkles", "desc": "Achieved TQ & Win at the same meeting"})

            # Overall personal best lap across all classes
            overall_best_lap = None
            if d["best_laps"]:
                overall_best_lap = min(d["best_laps"].values())

            # Compact record for driver index table
            summary_record = {
                "name": dname,
                "slug": slug,
                "meetings_count": m_count,
                "attendance_pct": attendance_pct,
                "total_laps": d["total_laps"],
                "a_final_wins": d["a_final_wins"],
                "a_final_podiums": d["a_final_podiums"],
                "a_final_appearances": d["a_final_appearances"],
                "a_final_rate": a_final_pct,
                "a_final_podium_rate": round((d["a_final_podiums"] / d["a_final_appearances"]) * 100, 1) if d["a_final_appearances"] > 0 else 0,
                "a_final_avg_pos": round(sum(d["a_final_positions"]) / len(d["a_final_positions"]), 1) if d["a_final_positions"] else None,
                "a_finals_by_class": dict(d["a_finals_by_class"]),
                "tqs": d["tqs"],
                "classes": sorted(list(d["classes"])),
                "best_lap": overall_best_lap,
                "metronome": metronome,
                "badges_count": len(badges)
            }
            drivers_index.append(summary_record)

            # Detailed Profile JSON
            full_profile = {
                "name": dname,
                "slug": slug,
                "summary": summary_record,
                "badges": badges,
                "personal_bests": {
                    "best_laps_per_class": d["best_laps"],
                    "best_runs_per_class": d["best_runs"],
                    "highest_finishes_per_class": d["highest_finishes"],
                    "highest_quals_per_class": d["highest_quals"],
                    "best10_per_class": d["best10"]
                },
                "timeline": sorted(d["timeline"], key=lambda t: t["meeting_id"], reverse=True)
            }

            profile_path = os.path.join(DRIVERS_DIR, f"{slug}.json")
            with open(profile_path, "w", encoding="utf-8") as pf:
                json.dump(full_profile, pf, indent=2)

        # Sort driver index by A-final wins, then podiums, then meetings
        drivers_index.sort(key=lambda x: (x["a_final_wins"], x["a_final_podiums"], x["meetings_count"]), reverse=True)

        # Format H2H matrix
        h2h_list = []
        for d1, opps in self.h2h_matches.items():
            for d2, stats in opps.items():
                if stats["meetings"] >= 2:
                    h2h_list.append({
                        "driver_a": d1,
                        "driver_b": d2,
                        "wins_a": stats["wins_a"],
                        "wins_b": stats["wins_b"],
                        "total_races": stats["meetings"]
                    })
        h2h_list.sort(key=lambda x: x["total_races"], reverse=True)

        # Add top A-finalists and recent winners to club_data
        top_afinalists = sorted(
            [d for d in drivers_index if d["meetings_count"] >= 3],
            key=lambda x: (x["a_final_rate"], x["a_final_appearances"], x["a_final_wins"]),
            reverse=True
        )[:8]
        club_data["top_afinalists"] = top_afinalists

        recent_meetings = sorted(self.meetings_summary, key=lambda m: m["id"], reverse=True)[:3]
        club_data["recent_meetings"] = [
            {
                "meeting_id": rm["id"],
                "date": rm["date"],
                "title": rm["title"],
                "winners": rm["winners"],
                "tqs": rm["tqs"]
            }
            for rm in recent_meetings
        ]

        # Save all generated files
        os.makedirs(DOCS_DATA_DIR, exist_ok=True)
        
        with open(os.path.join(DOCS_DATA_DIR, "club.json"), "w", encoding="utf-8") as f:
            json.dump(club_data, f, indent=2)
        print(f"[Aggregator] Saved docs/data/club.json")

        with open(os.path.join(DOCS_DATA_DIR, "drivers.json"), "w", encoding="utf-8") as f:
            json.dump(drivers_index, f, indent=2)
        print(f"[Aggregator] Saved docs/data/drivers.json ({len(drivers_index)} drivers)")

        with open(os.path.join(DOCS_DATA_DIR, "classes.json"), "w", encoding="utf-8") as f:
            json.dump(class_records, f, indent=2)
        print(f"[Aggregator] Saved docs/data/classes.json ({len(class_records)} classes)")

        # Meetings sorted newest first for frontend display
        meetings_display = sorted(self.meetings_summary, key=lambda m: m["id"], reverse=True)
        with open(os.path.join(DOCS_DATA_DIR, "meetings.json"), "w", encoding="utf-8") as f:
            json.dump(meetings_display, f, indent=2)
        print(f"[Aggregator] Saved docs/data/meetings.json ({len(meetings_display)} meetings)")

        with open(os.path.join(DOCS_DATA_DIR, "h2h.json"), "w", encoding="utf-8") as f:
            json.dump(h2h_list, f, indent=2)
        print(f"[Aggregator] Saved docs/data/h2h.json ({len(h2h_list)} rivalry matchups)")

        print("[Aggregator] Aggregation successfully finished!")


if __name__ == "__main__":
    agg = StatsAggregator()
    agg.load_all_raw_meetings()
    agg.process()
