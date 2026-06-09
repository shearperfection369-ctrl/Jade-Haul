"""Curated POI dataset for Jade Haul location intelligence.

Real-world freight-corridor points of interest along I-10 / I-40 / I-5 / I-95
with categories, hours, services, phones, and lat/lng. Used by /api/locations/nearby
and injected into JADE chat when the driver asks location-aware questions.

In production this would be replaced with HERE / Google Places / TruckMap APIs.
"""

POIS = [
    # ---------- Mechanics / Heavy-truck repair ----------
    {"id": "POI-M-001", "name": "Speedco · Phoenix West", "category": "mechanic", "subcategory": "drive-thru-pm",
     "lat": 33.4150, "lng": -112.2620, "city": "Phoenix", "state": "AZ",
     "address": "8965 W Latham St, Phoenix, AZ 85037", "phone": "(623) 936-9530",
     "hours": "Mon-Sun 24/7", "services": ["PM service", "tires", "DOT inspection"],
     "rating": 4.4, "notes": "Drive-thru oil change, ~45 min wait avg."},
    {"id": "POI-M-002", "name": "TA Petro Truck Service · Tonopah", "category": "mechanic", "subcategory": "heavy-repair",
     "lat": 33.5273, "lng": -113.0742, "city": "Tonopah", "state": "AZ",
     "address": "44045 W Indian School Rd, Tonopah, AZ 85354", "phone": "(623) 386-2300",
     "hours": "Mon-Sun 24/7", "services": ["engine", "transmission", "brakes", "tires", "AC"],
     "rating": 4.1, "notes": "Major heavy-truck shop. Towing available."},
    {"id": "POI-M-003", "name": "Love's Truck Care · Quartzsite", "category": "mechanic", "subcategory": "heavy-repair",
     "lat": 33.6634, "lng": -114.2299, "city": "Quartzsite", "state": "AZ",
     "address": "1601 N Riggles Ave, Quartzsite, AZ 85346", "phone": "(928) 927-7900",
     "hours": "Mon-Sun 6:00 AM - 10:00 PM", "services": ["tires", "PM", "DOT inspection"],
     "rating": 4.3, "notes": "Adjacent to truck stop fuel island."},
    {"id": "POI-M-004", "name": "Kenworth Sales · Tucson", "category": "mechanic", "subcategory": "dealer",
     "lat": 32.1543, "lng": -110.9486, "city": "Tucson", "state": "AZ",
     "address": "3955 E Illinois St, Tucson, AZ 85714", "phone": "(520) 745-7000",
     "hours": "Mon-Fri 7:00 AM - 7:00 PM · Sat 7:00 AM - 3:00 PM · Sun closed",
     "services": ["Kenworth dealer", "warranty", "engine", "drivetrain"], "rating": 4.5,
     "notes": "Best for warranty work; appointment recommended."},
    {"id": "POI-M-005", "name": "Freightliner of Arizona · Phoenix", "category": "mechanic", "subcategory": "dealer",
     "lat": 33.4360, "lng": -112.0790, "city": "Phoenix", "state": "AZ",
     "address": "2425 S 23rd Ave, Phoenix, AZ 85009", "phone": "(602) 470-0050",
     "hours": "Mon-Fri 7:00 AM - 11:00 PM · Sat 7:00 AM - 3:30 PM · Sun closed",
     "services": ["Freightliner dealer", "Detroit Diesel", "warranty", "after-treatment"],
     "rating": 4.6, "notes": "Full Detroit Diesel certified shop."},
    {"id": "POI-M-006", "name": "TravelCenters of America · Lordsburg", "category": "mechanic", "subcategory": "heavy-repair",
     "lat": 32.3506, "lng": -108.7087, "city": "Lordsburg", "state": "NM",
     "address": "I-10 Exit 22, Lordsburg, NM 88045", "phone": "(575) 542-3491",
     "hours": "Mon-Sun 24/7", "services": ["tires", "PM", "DOT inspection", "roadside"],
     "rating": 4.0, "notes": "Last big shop before Arizona border."},
    {"id": "POI-M-007", "name": "Volvo Trucks · El Paso", "category": "mechanic", "subcategory": "dealer",
     "lat": 31.7619, "lng": -106.4850, "city": "El Paso", "state": "TX",
     "address": "11550 Pellicano Dr, El Paso, TX 79935", "phone": "(915) 595-7676",
     "hours": "Mon-Fri 7:00 AM - 11:00 PM · Sat 8:00 AM - 5:00 PM · Sun closed",
     "services": ["Volvo dealer", "Mack dealer", "warranty"], "rating": 4.4,
     "notes": ""},

    # ---------- Truck stops / Fuel ----------
    {"id": "POI-F-001", "name": "Love's Travel Stop #423", "category": "fuel", "subcategory": "love",
     "lat": 33.4022, "lng": -111.6735, "city": "Apache Junction", "state": "AZ",
     "address": "1601 W Apache Trail, Apache Junction, AZ 85120", "phone": "(480) 982-1990",
     "hours": "Mon-Sun 24/7", "services": ["diesel", "DEF", "showers", "laundry", "Subway", "Hardee's"],
     "rating": 4.4, "notes": "180 truck slots. Showers $15. Hot food until 22:00."},
    {"id": "POI-F-002", "name": "Pilot Travel Center #237", "category": "fuel", "subcategory": "pilot",
     "lat": 32.2226, "lng": -110.9747, "city": "Tucson", "state": "AZ",
     "address": "I-10 Exit 268, Tucson, AZ 85714", "phone": "(520) 884-4445",
     "hours": "Mon-Sun 24/7", "services": ["diesel", "DEF", "showers", "Wendy's", "PJ Fresh"],
     "rating": 4.3, "notes": "92 truck slots; fresh coffee 24/7."},
    {"id": "POI-F-003", "name": "Flying J #672", "category": "fuel", "subcategory": "flying-j",
     "lat": 33.6634, "lng": -114.2299, "city": "Quartzsite", "state": "AZ",
     "address": "1201 W Main St, Quartzsite, AZ 85346", "phone": "(928) 927-7800",
     "hours": "Mon-Sun 24/7", "services": ["diesel", "DEF", "showers", "Denny's"],
     "rating": 4.2, "notes": "Denny's 24/7. 145 slots."},
    {"id": "POI-F-004", "name": "TA Travel Center · Lordsburg", "category": "fuel", "subcategory": "ta",
     "lat": 32.3506, "lng": -108.7087, "city": "Lordsburg", "state": "NM",
     "address": "I-10 Exit 22, Lordsburg, NM 88045", "phone": "(575) 542-3471",
     "hours": "Mon-Sun 24/7", "services": ["diesel", "DEF", "showers", "Country Pride", "Popeyes"],
     "rating": 4.1, "notes": "Truck wash on-site."},
    {"id": "POI-F-005", "name": "Petro Stopping Center · El Paso", "category": "fuel", "subcategory": "petro",
     "lat": 31.7619, "lng": -106.4850, "city": "El Paso", "state": "TX",
     "address": "1295 Horizon Blvd, El Paso, TX 79927", "phone": "(915) 852-9900",
     "hours": "Mon-Sun 24/7", "services": ["diesel", "DEF", "showers", "Iron Skillet", "Subway"],
     "rating": 4.5, "notes": "260 slots. Iron Skillet famous chicken-fried steak."},

    # ---------- Shippers / Receivers (delivery hours matter!) ----------
    {"id": "POI-S-001", "name": "FreshHarvest Foods · Phoenix DC", "category": "shipper", "subcategory": "receiver",
     "lat": 33.4484, "lng": -112.0740, "city": "Phoenix", "state": "AZ",
     "address": "4400 W Buckeye Rd, Phoenix, AZ 85043", "phone": "(602) 555-0181",
     "hours": "Mon-Fri 06:00 - 22:00 · Sat 06:00 - 14:00 · Sun closed",
     "services": ["dock-high", "live unload", "reefer", "appointment required"],
     "rating": 4.2, "notes": "Detention starts after 2 hours. Check-in at guard shack."},
    {"id": "POI-S-002", "name": "Atlas Freight Cross-Dock · Dallas", "category": "shipper", "subcategory": "cross-dock",
     "lat": 32.7767, "lng": -96.7970, "city": "Dallas", "state": "TX",
     "address": "1485 Tradeport Dr, Dallas, TX 75212", "phone": "(214) 555-0144",
     "hours": "Mon-Sun 24/7",
     "services": ["live load", "drop trailer", "dock-high"], "rating": 4.5,
     "notes": "Pre-loaded trailers ready in 30 min for drop-and-hook."},
    {"id": "POI-S-003", "name": "Sunbelt Logistics Dock · LA", "category": "shipper", "subcategory": "receiver",
     "lat": 34.0522, "lng": -118.2437, "city": "Los Angeles", "state": "CA",
     "address": "5500 E Olympic Blvd, Los Angeles, CA 90040", "phone": "(323) 555-0119",
     "hours": "Mon-Fri 05:00 - 23:00 · Sat 05:00 - 12:00 · Sun closed",
     "services": ["dock-high", "appointment required"], "rating": 4.0,
     "notes": "Strict appointment window — 30-min late = reschedule."},
    {"id": "POI-S-004", "name": "Northwood Building Co. · Houston Yard", "category": "shipper", "subcategory": "shipper",
     "lat": 29.7604, "lng": -95.3698, "city": "Houston", "state": "TX",
     "address": "11920 Wallisville Rd, Houston, TX 77013", "phone": "(713) 555-0163",
     "hours": "Mon-Fri 07:00 - 17:00 · Sat 07:00 - 12:00 · Sun closed",
     "services": ["flatbed", "live load", "tarping required"], "rating": 4.3,
     "notes": "Lumber & building materials. Tarp tower available."},
    {"id": "POI-S-005", "name": "Pacific Bridge Terminal · Seattle", "category": "shipper", "subcategory": "cross-dock",
     "lat": 47.6062, "lng": -122.3321, "city": "Seattle", "state": "WA",
     "address": "8800 East Marginal Way S, Seattle, WA 98108", "phone": "(206) 555-0177",
     "hours": "Mon-Sun 24/7", "services": ["drop trailer", "reefer", "container"],
     "rating": 4.6, "notes": "Port access. ELD synced via gate."},

    # ---------- Rest areas / Parking ----------
    {"id": "POI-R-001", "name": "I-10 Picacho Peak Rest Area", "category": "rest", "subcategory": "state-rest",
     "lat": 32.6502, "lng": -111.4011, "city": "Picacho", "state": "AZ",
     "address": "I-10 W mile marker 219, Picacho, AZ", "phone": "",
     "hours": "Mon-Sun 24/7", "services": ["restrooms", "vending", "truck parking", "no fuel"],
     "rating": 3.9, "notes": "~45 truck slots. Lit, well-patrolled."},
    {"id": "POI-R-002", "name": "Sells Truck Parking", "category": "rest", "subcategory": "private-parking",
     "lat": 31.9134, "lng": -111.8852, "city": "Sells", "state": "AZ",
     "address": "I-19, Sells, AZ", "phone": "",
     "hours": "Mon-Sun 24/7", "services": ["truck parking", "no services"],
     "rating": 3.5, "notes": "Last large parking before Mexico border."},

    # ---------- Food (driver-recommended sit-down) ----------
    {"id": "POI-D-001", "name": "Iron Skillet @ Petro El Paso", "category": "food", "subcategory": "sit-down",
     "lat": 31.7619, "lng": -106.4850, "city": "El Paso", "state": "TX",
     "address": "1295 Horizon Blvd, El Paso, TX 79927", "phone": "(915) 852-9900",
     "hours": "Mon-Sun 24/7", "services": ["breakfast", "lunch", "dinner", "buffet"],
     "rating": 4.4, "notes": "Famous chicken-fried steak."},
    {"id": "POI-D-002", "name": "Country Pride @ TA Lordsburg", "category": "food", "subcategory": "sit-down",
     "lat": 32.3506, "lng": -108.7087, "city": "Lordsburg", "state": "NM",
     "address": "I-10 Exit 22, Lordsburg, NM 88045", "phone": "(575) 542-3471",
     "hours": "Mon-Sun 24/7", "services": ["breakfast", "lunch", "dinner"],
     "rating": 4.1, "notes": "Classic trucker diner. Free pie Wed."},

    # ---------- Hotels ----------
    {"id": "POI-H-001", "name": "Best Western Phoenix West", "category": "hotel", "subcategory": "truck-parking",
     "lat": 33.4495, "lng": -112.2700, "city": "Phoenix", "state": "AZ",
     "address": "1100 N 99th Ave, Phoenix, AZ 85037", "phone": "(623) 932-9900",
     "hours": "Mon-Sun 24/7", "services": ["truck parking", "WiFi", "breakfast"],
     "rating": 4.0, "notes": "12 dedicated semi spots. Reserve ahead."},
]


CATEGORY_KEYWORDS = {
    "mechanic": ["mechanic", "shop", "repair", "diagnose", "engine", "transmission", "brake", "tire", "dealer", "freightliner", "kenworth", "volvo", "mack", "peterbilt", "speedco", "broken", "fix"],
    "fuel": ["fuel", "gas", "diesel", "def", "fill up", "fillup", "truck stop", "pilot", "love's", "loves", "ta ", "petro", "flying j"],
    "shipper": ["shipper", "receiver", "consignee", "dock", "delivery", "dropoff", "drop-off", "warehouse", "dc", "appointment", "hours of", "open"],
    "rest": ["rest", "park", "parking", "sleep", "nap", "10 hour", "10-hour", "reset"],
    "food": ["food", "eat", "breakfast", "lunch", "dinner", "coffee", "hungry", "meal", "diner", "restaurant"],
    "hotel": ["hotel", "motel", "stay", "room", "shower", "sleep over"],
    "weigh": ["weigh", "scale", "bypass", "inspection", "dot scale"],
}


def detect_categories(text: str) -> list[str]:
    """Return list of POI categories that match keywords in the user's message."""
    t = (text or "").lower()
    hits = []
    for cat, kws in CATEGORY_KEYWORDS.items():
        if any(k in t for k in kws):
            hits.append(cat)
    return hits
