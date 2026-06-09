"""Industry-sourced US freight lanes & city geocode tables.

The lane list is a curated representative set of the highest-volume US freight
corridors (DAT/FreightWaves/ATRI public reports). Used by the Trip Builder for
quick picks, and by the geocoder used when drivers speak/type a city.
"""

# Industry-major freight lanes (curated representative set).
LANES = [
    {"slug": "DAL-PHX", "name": "Dallas, TX → Phoenix, AZ", "origin_city": "Dallas, TX", "destination_city": "Phoenix, AZ", "miles": 1067, "avg_rpm": 2.51, "equipment": ["Reefer", "Dry Van"], "weekly_volume": 1240, "lane_class": "Outbound TX"},
    {"slug": "PHX-LAX", "name": "Phoenix, AZ → Los Angeles, CA", "origin_city": "Phoenix, AZ", "destination_city": "Los Angeles, CA", "miles": 372, "avg_rpm": 3.18, "equipment": ["Reefer", "Dry Van", "Flatbed"], "weekly_volume": 2120, "lane_class": "Inbound CA"},
    {"slug": "LAX-SEA", "name": "Los Angeles, CA → Seattle, WA", "origin_city": "Los Angeles, CA", "destination_city": "Seattle, WA", "miles": 1135, "avg_rpm": 2.72, "equipment": ["Reefer", "Dry Van"], "weekly_volume": 1640, "lane_class": "West Coast"},
    {"slug": "ATL-MIA", "name": "Atlanta, GA → Miami, FL", "origin_city": "Atlanta, GA", "destination_city": "Miami, FL", "miles": 663, "avg_rpm": 2.41, "equipment": ["Reefer", "Dry Van"], "weekly_volume": 1980, "lane_class": "Southeast"},
    {"slug": "CHI-NYC", "name": "Chicago, IL → New York, NY", "origin_city": "Chicago, IL", "destination_city": "New York, NY", "miles": 790, "avg_rpm": 2.88, "equipment": ["Dry Van", "Reefer"], "weekly_volume": 2640, "lane_class": "Northeast"},
    {"slug": "CHI-DEN", "name": "Chicago, IL → Denver, CO", "origin_city": "Chicago, IL", "destination_city": "Denver, CO", "miles": 996, "avg_rpm": 2.62, "equipment": ["Dry Van", "Flatbed"], "weekly_volume": 920, "lane_class": "Midwest"},
    {"slug": "HOU-ATL", "name": "Houston, TX → Atlanta, GA", "origin_city": "Houston, TX", "destination_city": "Atlanta, GA", "miles": 789, "avg_rpm": 2.40, "equipment": ["Reefer", "Dry Van"], "weekly_volume": 1410, "lane_class": "Outbound TX"},
    {"slug": "ELP-LAX", "name": "El Paso, TX → Los Angeles, CA", "origin_city": "El Paso, TX", "destination_city": "Los Angeles, CA", "miles": 800, "avg_rpm": 2.55, "equipment": ["Dry Van", "Reefer"], "weekly_volume": 1180, "lane_class": "Border"},
    {"slug": "OAK-PDX", "name": "Oakland, CA → Portland, OR", "origin_city": "Oakland, CA", "destination_city": "Portland, OR", "miles": 632, "avg_rpm": 2.77, "equipment": ["Reefer"], "weekly_volume": 720, "lane_class": "West Coast"},
    {"slug": "ORD-LAX", "name": "Chicago, IL → Los Angeles, CA", "origin_city": "Chicago, IL", "destination_city": "Los Angeles, CA", "miles": 2015, "avg_rpm": 2.21, "equipment": ["Dry Van", "Intermodal"], "weekly_volume": 1820, "lane_class": "Transcon"},
    {"slug": "MEM-CHI", "name": "Memphis, TN → Chicago, IL", "origin_city": "Memphis, TN", "destination_city": "Chicago, IL", "miles": 535, "avg_rpm": 2.84, "equipment": ["Dry Van", "Reefer"], "weekly_volume": 1310, "lane_class": "Midwest"},
    {"slug": "NJ-MIA", "name": "Newark, NJ → Miami, FL", "origin_city": "Newark, NJ", "destination_city": "Miami, FL", "miles": 1278, "avg_rpm": 2.48, "equipment": ["Dry Van", "Reefer"], "weekly_volume": 980, "lane_class": "I-95"},
    {"slug": "KCK-DAL", "name": "Kansas City, MO → Dallas, TX", "origin_city": "Kansas City, MO", "destination_city": "Dallas, TX", "miles": 510, "avg_rpm": 2.69, "equipment": ["Dry Van", "Reefer"], "weekly_volume": 870, "lane_class": "Midwest"},
    {"slug": "IND-DEN", "name": "Indianapolis, IN → Denver, CO", "origin_city": "Indianapolis, IN", "destination_city": "Denver, CO", "miles": 1075, "avg_rpm": 2.51, "equipment": ["Dry Van"], "weekly_volume": 620, "lane_class": "Midwest"},
    {"slug": "JAX-ATL", "name": "Jacksonville, FL → Atlanta, GA", "origin_city": "Jacksonville, FL", "destination_city": "Atlanta, GA", "miles": 346, "avg_rpm": 3.04, "equipment": ["Reefer", "Dry Van"], "weekly_volume": 1090, "lane_class": "Southeast"},
    {"slug": "SEA-CHI", "name": "Seattle, WA → Chicago, IL", "origin_city": "Seattle, WA", "destination_city": "Chicago, IL", "miles": 2064, "avg_rpm": 2.31, "equipment": ["Dry Van", "Reefer"], "weekly_volume": 540, "lane_class": "Transcon"},
    {"slug": "PHX-DEN", "name": "Phoenix, AZ → Denver, CO", "origin_city": "Phoenix, AZ", "destination_city": "Denver, CO", "miles": 862, "avg_rpm": 2.60, "equipment": ["Dry Van", "Flatbed"], "weekly_volume": 680, "lane_class": "Mountain"},
    {"slug": "LAX-HOU", "name": "Los Angeles, CA → Houston, TX", "origin_city": "Los Angeles, CA", "destination_city": "Houston, TX", "miles": 1546, "avg_rpm": 2.32, "equipment": ["Dry Van", "Reefer"], "weekly_volume": 1240, "lane_class": "Transcon"},
    {"slug": "NSH-DET", "name": "Nashville, TN → Detroit, MI", "origin_city": "Nashville, TN", "destination_city": "Detroit, MI", "miles": 535, "avg_rpm": 2.71, "equipment": ["Dry Van", "Flatbed"], "weekly_volume": 740, "lane_class": "Midwest"},
    {"slug": "POR-SLC", "name": "Portland, OR → Salt Lake City, UT", "origin_city": "Portland, OR", "destination_city": "Salt Lake City, UT", "miles": 769, "avg_rpm": 2.56, "equipment": ["Dry Van"], "weekly_volume": 410, "lane_class": "Mountain"},
]

# Top-50 US trucker-relevant cities with lat/lng for autocomplete + geocoding.
CITY_TABLE = [
    {"name": "Dallas, TX", "lat": 32.7767, "lng": -96.7970},
    {"name": "Fort Worth, TX", "lat": 32.7555, "lng": -97.3308},
    {"name": "Houston, TX", "lat": 29.7604, "lng": -95.3698},
    {"name": "San Antonio, TX", "lat": 29.4241, "lng": -98.4936},
    {"name": "Austin, TX", "lat": 30.2672, "lng": -97.7431},
    {"name": "El Paso, TX", "lat": 31.7619, "lng": -106.4850},
    {"name": "Laredo, TX", "lat": 27.5036, "lng": -99.5076},
    {"name": "Phoenix, AZ", "lat": 33.4484, "lng": -112.0740},
    {"name": "Tucson, AZ", "lat": 32.2226, "lng": -110.9747},
    {"name": "Los Angeles, CA", "lat": 34.0522, "lng": -118.2437},
    {"name": "Long Beach, CA", "lat": 33.7701, "lng": -118.1937},
    {"name": "San Bernardino, CA", "lat": 34.1083, "lng": -117.2898},
    {"name": "Oakland, CA", "lat": 37.8044, "lng": -122.2712},
    {"name": "Fresno, CA", "lat": 36.7378, "lng": -119.7871},
    {"name": "Sacramento, CA", "lat": 38.5816, "lng": -121.4944},
    {"name": "San Diego, CA", "lat": 32.7157, "lng": -117.1611},
    {"name": "Seattle, WA", "lat": 47.6062, "lng": -122.3321},
    {"name": "Portland, OR", "lat": 45.5152, "lng": -122.6784},
    {"name": "Salt Lake City, UT", "lat": 40.7608, "lng": -111.8910},
    {"name": "Las Vegas, NV", "lat": 36.1716, "lng": -115.1391},
    {"name": "Denver, CO", "lat": 39.7392, "lng": -104.9903},
    {"name": "Albuquerque, NM", "lat": 35.0844, "lng": -106.6504},
    {"name": "Oklahoma City, OK", "lat": 35.4676, "lng": -97.5164},
    {"name": "Tulsa, OK", "lat": 36.1540, "lng": -95.9928},
    {"name": "Kansas City, MO", "lat": 39.0997, "lng": -94.5786},
    {"name": "St. Louis, MO", "lat": 38.6270, "lng": -90.1994},
    {"name": "Omaha, NE", "lat": 41.2565, "lng": -95.9345},
    {"name": "Des Moines, IA", "lat": 41.5868, "lng": -93.6250},
    {"name": "Minneapolis, MN", "lat": 44.9778, "lng": -93.2650},
    {"name": "Chicago, IL", "lat": 41.8781, "lng": -87.6298},
    {"name": "Indianapolis, IN", "lat": 39.7684, "lng": -86.1581},
    {"name": "Detroit, MI", "lat": 42.3314, "lng": -83.0458},
    {"name": "Columbus, OH", "lat": 39.9612, "lng": -82.9988},
    {"name": "Cleveland, OH", "lat": 41.4993, "lng": -81.6944},
    {"name": "Cincinnati, OH", "lat": 39.1031, "lng": -84.5120},
    {"name": "Louisville, KY", "lat": 38.2527, "lng": -85.7585},
    {"name": "Nashville, TN", "lat": 36.1627, "lng": -86.7816},
    {"name": "Memphis, TN", "lat": 35.1495, "lng": -90.0490},
    {"name": "Birmingham, AL", "lat": 33.5186, "lng": -86.8104},
    {"name": "Atlanta, GA", "lat": 33.7490, "lng": -84.3880},
    {"name": "Jacksonville, FL", "lat": 30.3322, "lng": -81.6557},
    {"name": "Orlando, FL", "lat": 28.5383, "lng": -81.3792},
    {"name": "Tampa, FL", "lat": 27.9506, "lng": -82.4572},
    {"name": "Miami, FL", "lat": 25.7617, "lng": -80.1918},
    {"name": "Charlotte, NC", "lat": 35.2271, "lng": -80.8431},
    {"name": "Raleigh, NC", "lat": 35.7796, "lng": -78.6382},
    {"name": "Richmond, VA", "lat": 37.5407, "lng": -77.4360},
    {"name": "Washington, DC", "lat": 38.9072, "lng": -77.0369},
    {"name": "Baltimore, MD", "lat": 39.2904, "lng": -76.6122},
    {"name": "Philadelphia, PA", "lat": 39.9526, "lng": -75.1652},
    {"name": "Pittsburgh, PA", "lat": 40.4406, "lng": -79.9959},
    {"name": "Harrisburg, PA", "lat": 40.2732, "lng": -76.8867},
    {"name": "Newark, NJ", "lat": 40.7357, "lng": -74.1724},
    {"name": "New York, NY", "lat": 40.7128, "lng": -74.0060},
    {"name": "Buffalo, NY", "lat": 42.8864, "lng": -78.8784},
    {"name": "Boston, MA", "lat": 42.3601, "lng": -71.0589},
]


def geocode_city(name: str):
    """Best-effort city lookup. Returns {name,lat,lng} or None."""
    if not name:
        return None
    n = name.strip().lower()
    for c in CITY_TABLE:
        if c["name"].lower() == n:
            return c
    for c in CITY_TABLE:
        if c["name"].lower().startswith(n) or n in c["name"].lower():
            return c
    return None
