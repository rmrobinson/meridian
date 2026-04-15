#!/usr/bin/env bash
# test-events.sh — create 20 sample life events via grpcurl, then read them back via curl.
# Run from the backend/ directory with the server already started:
#   go run ./cmd/server -config test-config.yaml
set -euo pipefail

GRPC_ADDR="localhost:9090"
REST_ADDR="http://localhost:8080"

# Raw write token (bcrypt hash stored in test-config.yaml)
WRITE_TOKEN="test-write-token"

# JWT signed with test-jwt-secret-for-meridian-dev!, role=owner
# Regenerate at jwt.io (HS256) or with: python3 -c "
#   import hmac,hashlib,base64,json
#   b64=lambda d: base64.urlsafe_b64encode(json.dumps(d,separators=(',',':')).encode()).rstrip(b'=').decode()
#   h=b64({'alg':'HS256','typ':'JWT'}); p=b64({'role':'owner'})
#   s=base64.urlsafe_b64encode(hmac.new(b'test-jwt-secret-for-meridian-dev!',f'{h}.{p}'.encode(),hashlib.sha256).digest()).rstrip(b'=').decode()
#   print(f'{h}.{p}.{s}')"
JWT="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJyb2xlIjoib3duZXIifQ.zUDlYB8821K_UxoX0C0qCwG3P_q6AsYKyXS52nhVtXk"

# Proto location (relative to backend/)
PROTO_IMPORT="../proto"
PROTO_FILE="meridian/v1/timeline.proto"

grpc_create() {
  local json
  json=$(cat)
  grpcurl -plaintext \
    -import-path "$PROTO_IMPORT" \
    -proto "$PROTO_FILE" \
    -H "Authorization: Bearer $WRITE_TOKEN" \
    -d "$json" \
    "$GRPC_ADDR" meridian.v1.TimelineService/CreateEvent
}

echo "===== Creating 31 life events ====="
echo ""

# ── SPINE RELOCATIONS (6) — required for week grid residence colouring ────────

echo "--- [1/26] Grew up in Ottawa ---"
grpc_create <<'EOF'
{
  "family_id": "spine",
  "line_key": "spine",
  "type": "EVENT_TYPE_POINT",
  "title": "Born in Ottawa",
  "icon": "mdi:home",
  "date": "1992-03-14",
  "location": {"label": "Ottawa, ON", "lat": 45.4215, "lng": -75.6972},
  "visibility": "VISIBILITY_PUBLIC",
  "life_metadata": {"milestone_type": "LIFE_MILESTONE_TYPE_RELOCATION"}
}
EOF

echo "--- [2/26] Moved to Toronto for university ---"
grpc_create <<'EOF'
{
  "family_id": "spine",
  "line_key": "spine",
  "type": "EVENT_TYPE_POINT",
  "title": "Moved to Toronto",
  "icon": "mdi:home",
  "date": "2010-09-01",
  "location": {"label": "Toronto, ON", "lat": 43.6532, "lng": -79.3832},
  "visibility": "VISIBILITY_PUBLIC",
  "life_metadata": {"milestone_type": "LIFE_MILESTONE_TYPE_RELOCATION"}
}
EOF

echo "--- [3/26] Moved to Waterloo for master's ---"
grpc_create <<'EOF'
{
  "family_id": "spine",
  "line_key": "spine",
  "type": "EVENT_TYPE_POINT",
  "title": "Moved to Waterloo",
  "icon": "mdi:home",
  "date": "2014-09-01",
  "location": {"label": "Waterloo, ON", "lat": 43.4668, "lng": -80.5164},
  "visibility": "VISIBILITY_PUBLIC",
  "life_metadata": {"milestone_type": "LIFE_MILESTONE_TYPE_RELOCATION"}
}
EOF

echo "--- [4/26] Moved back to Toronto for first job ---"
grpc_create <<'EOF'
{
  "family_id": "spine",
  "line_key": "spine",
  "type": "EVENT_TYPE_POINT",
  "title": "Moved back to Toronto",
  "icon": "mdi:home",
  "date": "2016-07-04",
  "location": {"label": "Toronto, ON", "lat": 43.6532, "lng": -79.3832},
  "visibility": "VISIBILITY_PUBLIC",
  "life_metadata": {"milestone_type": "LIFE_MILESTONE_TYPE_RELOCATION"}
}
EOF

echo "--- [5/26] Moved to Vancouver for Northstar ---"
grpc_create <<'EOF'
{
  "family_id": "spine",
  "line_key": "spine",
  "type": "EVENT_TYPE_POINT",
  "title": "Moved to Vancouver",
  "icon": "mdi:home",
  "date": "2019-04-15",
  "location": {"label": "Vancouver, BC", "lat": 49.2827, "lng": -123.1207},
  "visibility": "VISIBILITY_PUBLIC",
  "life_metadata": {"milestone_type": "LIFE_MILESTONE_TYPE_RELOCATION"}
}
EOF

echo "--- [6/26] Moved to Toronto for Meridian Systems ---"
grpc_create <<'EOF'
{
  "family_id": "spine",
  "line_key": "spine",
  "type": "EVENT_TYPE_POINT",
  "title": "Moved back to Toronto",
  "icon": "mdi:home",
  "date": "2023-02-01",
  "location": {"label": "Toronto, ON", "lat": 43.6532, "lng": -79.3832},
  "visibility": "VISIBILITY_PUBLIC",
  "life_metadata": {"milestone_type": "LIFE_MILESTONE_TYPE_RELOCATION"}
}
EOF

# ── TRAVEL (4 trips) ─────────────────────────────────────────────────────────

echo "--- [7/26] Backpacking Southeast Asia ---"
grpc_create <<'EOF'
{
  "family_id": "travel",
  "line_key": "trip-sea-asia",
  "type": "EVENT_TYPE_SPAN",
  "title": "Backpacking Southeast Asia",
  "icon": "mdi:airplane-takeoff",
  "end_icon": "mdi:airplane-landing",
  "description": "Three months backpacking through Thailand, Vietnam and Cambodia on a shoestring budget.",
  "start_date": "2015-06-01",
  "end_date": "2015-08-15",
  "location": {"label": "Thailand, Vietnam & Cambodia"},
  "visibility": "VISIBILITY_PUBLIC",
  "travel_metadata": {
    "countries": ["Thailand", "Vietnam", "Cambodia"],
    "cities": ["Bangkok", "Chiang Mai", "Hanoi", "Ho Chi Minh City", "Siem Reap"]
  }
}
EOF

echo "--- [8/26] Iceland Ring Road Trip ---"
grpc_create <<'EOF'
{
  "family_id": "travel",
  "line_key": "trip-iceland",
  "type": "EVENT_TYPE_SPAN",
  "title": "Iceland Ring Road Trip",
  "icon": "mdi:car",
  "description": "Two weeks driving the full Ring Road. Waterfalls, glaciers, and the midnight sun.",
  "start_date": "2018-07-10",
  "end_date": "2018-07-25",
  "location": {"label": "Iceland"},
  "visibility": "VISIBILITY_PUBLIC",
  "travel_metadata": {
    "countries": ["Iceland"],
    "cities": ["Reykjavik", "Akureyri", "Vik", "Hofn"]
  }
}
EOF

echo "--- [9/26] Japan — Tokyo & Kyoto ---"
grpc_create <<'EOF'
{
  "family_id": "travel",
  "line_key": "trip-japan",
  "type": "EVENT_TYPE_SPAN",
  "title": "Japan — Tokyo & Kyoto",
  "icon": "mdi:airplane-takeoff",
  "end_icon": "mdi:airplane-landing",
  "description": "Two weeks in Japan during autumn. Tokyo's energy contrasted perfectly with Kyoto's temples and gardens.",
  "start_date": "2022-11-01",
  "end_date": "2022-11-14",
  "location": {"label": "Japan", "lat": 36.2048, "lng": 138.2529},
  "visibility": "VISIBILITY_PUBLIC",
  "travel_metadata": {
    "countries": ["Japan"],
    "cities": ["Tokyo", "Kyoto", "Osaka", "Nara"]
  }
}
EOF

echo "--- [10/26] Portugal & Spain Road Trip ---"
grpc_create <<'EOF'
{
  "family_id": "travel",
  "line_key": "trip-iberia",
  "type": "EVENT_TYPE_SPAN",
  "title": "Portugal & Spain Road Trip",
  "icon": "mdi:car",
  "description": "Three weeks driving the Iberian Peninsula — pastéis de nata in Lisbon, flamenco in Seville, Alhambra in Granada.",
  "start_date": "2024-05-05",
  "end_date": "2024-05-22",
  "location": {"label": "Portugal & Spain"},
  "visibility": "VISIBILITY_PUBLIC",
  "travel_metadata": {
    "countries": ["Portugal", "Spain"],
    "cities": ["Lisbon", "Porto", "Seville", "Granada", "Madrid"]
  }
}
EOF

# ── EDUCATION (2) ────────────────────────────────────────────────────────────

echo "--- [11/26] BSc Computer Science ---"
grpc_create <<'EOF'
{
  "family_id": "education",
  "line_key": "degree-bsc-cs",
  "type": "EVENT_TYPE_SPAN",
  "title": "BSc Computer Science",
  "icon": "mdi:school",
  "description": "Undergraduate degree at the University of Toronto. Specialised in systems programming and algorithms.",
  "start_date": "2010-09-01",
  "end_date": "2014-04-30",
  "location": {"label": "University of Toronto, Toronto, ON", "lat": 43.6629, "lng": -79.3957},
  "visibility": "VISIBILITY_PUBLIC",
  "education_metadata": {
    "institution": "University of Toronto",
    "degree": "Bachelor of Science, Computer Science"
  }
}
EOF

echo "--- [12/26] MSc Human-Computer Interaction ---"
grpc_create <<'EOF'
{
  "family_id": "education",
  "line_key": "degree-msc-hci",
  "type": "EVENT_TYPE_SPAN",
  "title": "MSc Human-Computer Interaction",
  "icon": "mdi:school",
  "description": "Research-based master's degree focusing on accessibility and interface design. Thesis on adaptive UI for motor-impaired users.",
  "start_date": "2014-09-01",
  "end_date": "2016-04-30",
  "location": {"label": "University of Waterloo, Waterloo, ON", "lat": 43.4723, "lng": -80.5449},
  "visibility": "VISIBILITY_PUBLIC",
  "education_metadata": {
    "institution": "University of Waterloo",
    "degree": "Master of Science, Human-Computer Interaction"
  }
}
EOF

# ── EMPLOYMENT (3) ───────────────────────────────────────────────────────────

echo "--- [13/26] Junior Developer at Acme Software ---"
grpc_create <<'EOF'
{
  "family_id": "employment",
  "line_key": "job-acme",
  "type": "EVENT_TYPE_SPAN",
  "title": "Junior Developer — Acme Software",
  "icon": "mdi:briefcase",
  "description": "First industry role out of university. Built internal tooling and worked across the full stack on a SaaS billing platform.",
  "start_date": "2016-07-04",
  "end_date": "2019-03-29",
  "visibility": "VISIBILITY_PUBLIC",
  "employment_metadata": {
    "role": "Junior Software Developer",
    "company_name": "Acme Software",
    "company_url": "https://acme.example.com"
  }
}
EOF

echo "--- [14/26] Senior Engineer at Northstar Technologies ---"
grpc_create <<'EOF'
{
  "family_id": "employment",
  "line_key": "job-northstar",
  "type": "EVENT_TYPE_SPAN",
  "title": "Senior Engineer — Northstar Technologies",
  "icon": "mdi:briefcase",
  "description": "Led backend platform team of four engineers. Migrated a monolith to services, cut p99 latency by 60%.",
  "start_date": "2019-04-15",
  "end_date": "2022-12-16",
  "visibility": "VISIBILITY_PUBLIC",
  "employment_metadata": {
    "role": "Senior Software Engineer",
    "company_name": "Northstar Technologies",
    "company_url": "https://northstar.example.com"
  }
}
EOF

echo "--- [15/26] Staff Engineer at Meridian Systems (current) ---"
grpc_create <<'EOF'
{
  "family_id": "employment",
  "line_key": "job-meridian-systems",
  "type": "EVENT_TYPE_SPAN",
  "title": "Staff Engineer — Meridian Systems",
  "icon": "mdi:briefcase",
  "description": "Technical lead across three product teams. Driving the platform architecture and developer experience strategy.",
  "start_date": "2023-02-01",
  "visibility": "VISIBILITY_PUBLIC",
  "employment_metadata": {
    "role": "Staff Software Engineer",
    "company_name": "Meridian Systems",
    "company_url": "https://meridian.example.com"
  }
}
EOF

# ── HOBBIES (5) ──────────────────────────────────────────────────────────────

echo "--- [16/26] Started learning guitar ---"
grpc_create <<'EOF'
{
  "family_id": "hobbies",
  "line_key": "hobbies",
  "type": "EVENT_TYPE_POINT",
  "title": "Started Learning Guitar",
  "icon": "mdi:guitar-acoustic",
  "description": "Picked up a second-hand acoustic and started weekly lessons. Currently working through fingerpicking arrangements.",
  "date": "2017-03-15",
  "visibility": "VISIBILITY_PUBLIC"
}
EOF

echo "--- [17/26] Took up photography ---"
grpc_create <<'EOF'
{
  "family_id": "hobbies",
  "line_key": "hobbies",
  "type": "EVENT_TYPE_POINT",
  "title": "Took Up Photography",
  "icon": "mdi:camera",
  "description": "Got a mirrorless camera and started shooting street and landscape photography. Travel photos have never been the same.",
  "date": "2019-06-01",
  "visibility": "VISIBILITY_PUBLIC"
}
EOF

echo "--- [18/26] Radiohead concert — Madison Square Garden ---"
grpc_create <<'EOF'
{
  "family_id": "hobbies",
  "line_key": "hobbies",
  "type": "EVENT_TYPE_POINT",
  "title": "Radiohead — In Rainbows From the Basement Tour",
  "icon": "mdi:music",
  "description": "One of the best live shows I've ever seen. Thom Yorke's voice was otherworldly and the light show was extraordinary.",
  "date": "2018-10-08",
  "location": {"label": "Madison Square Garden, New York, NY", "lat": 40.7505, "lng": -73.9934},
  "visibility": "VISIBILITY_PUBLIC",
  "concert_metadata": {
    "main_act": "Radiohead",
    "venue": {"label": "Madison Square Garden, New York, NY", "lat": 40.7505, "lng": -73.9934}
  }
}
EOF

echo "--- [19/26] The National concert — Massey Hall ---"
grpc_create <<'EOF'
{
  "family_id": "hobbies",
  "line_key": "hobbies",
  "type": "EVENT_TYPE_POINT",
  "title": "The National — First Two Pages of Frankenstein Tour",
  "icon": "mdi:music",
  "description": "Intimate show in one of the world's great concert halls. Bloodbuzz Ohio as the encore was a perfect closer.",
  "date": "2023-05-20",
  "location": {"label": "Massey Hall, Toronto, ON", "lat": 43.6535, "lng": -79.3805},
  "visibility": "VISIBILITY_PUBLIC",
  "concert_metadata": {
    "main_act": "The National",
    "venue": {"label": "Massey Hall, Toronto, ON", "lat": 43.6535, "lng": -79.3805}
  }
}
EOF

echo "--- [20/26] Joined local cycling club ---"
grpc_create <<'EOF'
{
  "family_id": "fitness",
  "line_key": "fitness",
  "type": "EVENT_TYPE_POINT",
  "title": "Joined Local Cycling Club",
  "icon": "mdi:bicycle",
  "description": "Started riding with a local club on weekend group rides. Averaging 80km per Sunday through the summer.",
  "date": "2021-04-10",
  "visibility": "VISIBILITY_PUBLIC",
  "fitness_metadata": {
    "activity": "FITNESS_ACTIVITY_CYCLE"
  }
}
EOF

# ── BOOKS (6) ────────────────────────────────────────────────────────────────

echo "--- [21/26] Book: Dune ---"
grpc_create <<'EOF'
{
  "family_id": "books",
  "line_key": "book-dune",
  "type": "EVENT_TYPE_SPAN",
  "title": "Dune",
  "icon": "mdi:book-open-variant",
  "start_date": "2014-07-10",
  "end_date": "2014-08-10",
  "visibility": "VISIBILITY_PUBLIC",
  "book_metadata": {
    "isbn": "978-0-441-01359-3",
    "rating": 5,
    "review": "Epic science fiction. The worldbuilding is unparalleled."
  }
}
EOF

echo "--- [22/26] Book: The Name of the Wind ---"
grpc_create <<'EOF'
{
  "family_id": "books",
  "line_key": "book-name-of-wind",
  "type": "EVENT_TYPE_SPAN",
  "title": "The Name of the Wind",
  "icon": "mdi:book-open-variant",
  "start_date": "2016-02-20",
  "end_date": "2016-03-20",
  "visibility": "VISIBILITY_PUBLIC",
  "book_metadata": {
    "isbn": "978-0-7564-0407-9",
    "rating": 5,
    "review": "Beautiful prose and a deeply compelling narrator."
  }
}
EOF

echo "--- [23/26] Book: Sapiens ---"
grpc_create <<'EOF'
{
  "family_id": "books",
  "line_key": "book-sapiens",
  "type": "EVENT_TYPE_SPAN",
  "title": "Sapiens: A Brief History of Humankind",
  "icon": "mdi:book-open-variant",
  "start_date": "2017-10-05",
  "end_date": "2017-11-05",
  "visibility": "VISIBILITY_PUBLIC",
  "book_metadata": {
    "isbn": "978-0-06-231609-7",
    "rating": 4,
    "review": "Mind-expanding perspective on human history and civilization."
  }
}
EOF

echo "--- [24/26] Book: Project Hail Mary ---"
grpc_create <<'EOF'
{
  "family_id": "books",
  "line_key": "book-project-hail-mary",
  "type": "EVENT_TYPE_SPAN",
  "title": "Project Hail Mary",
  "icon": "mdi:book-open-variant",
  "start_date": "2021-08-05",
  "end_date": "2021-08-22",
  "visibility": "VISIBILITY_PUBLIC",
  "book_metadata": {
    "isbn": "978-0-593-13520-4",
    "rating": 5,
    "review": "Couldn't put it down. Rocky is one of the best characters in sci-fi."
  }
}
EOF

echo "--- [25/26] Book: The Pragmatic Programmer ---"
grpc_create <<'EOF'
{
  "family_id": "books",
  "line_key": "book-pragmatic-programmer",
  "type": "EVENT_TYPE_SPAN",
  "title": "The Pragmatic Programmer",
  "icon": "mdi:book-open-variant",
  "start_date": "2022-02-10",
  "end_date": "2022-03-15",
  "visibility": "VISIBILITY_PERSONAL",
  "book_metadata": {
    "isbn": "978-0-13-595705-9",
    "rating": 4,
    "review": "Essential career reading. Changed how I think about software craft."
  }
}
EOF

echo "--- [26/26] Book: Never Split the Difference ---"
grpc_create <<'EOF'
{
  "family_id": "books",
  "line_key": "book-never-split",
  "type": "EVENT_TYPE_SPAN",
  "title": "Never Split the Difference",
  "icon": "mdi:book-open-variant",
  "start_date": "2023-10-08",
  "end_date": "2023-10-30",
  "visibility": "VISIBILITY_PUBLIC",
  "book_metadata": {
    "isbn": "978-0-06-240780-1",
    "rating": 4,
    "review": "Surprisingly practical. The mirroring and labelling techniques actually work."
  }
}
EOF

# ── FILM & TV (5) ────────────────────────────────────────────────────────────

echo "--- [27/31] Movie: Inception ---"
grpc_create <<'EOF'
{
  "family_id": "film_tv",
  "line_key": "film-inception",
  "type": "EVENT_TYPE_POINT",
  "title": "Inception",
  "icon": "mdi:movie-open",
  "date": "2010-08-14",
  "visibility": "VISIBILITY_PUBLIC",
  "film_tv_metadata": {
    "type": "FILM_TV_TYPE_MOVIE",
    "rating": 5,
    "review": "A masterclass in layered storytelling. Watched it three times before the credits felt earned."
  }
}
EOF

echo "--- [28/31] Movie: Arrival ---"
grpc_create <<'EOF'
{
  "family_id": "film_tv",
  "line_key": "film-arrival",
  "type": "EVENT_TYPE_POINT",
  "title": "Arrival",
  "icon": "mdi:movie-open",
  "date": "2016-11-25",
  "visibility": "VISIBILITY_PUBLIC",
  "film_tv_metadata": {
    "type": "FILM_TV_TYPE_MOVIE",
    "rating": 5,
    "review": "The most emotionally devastating sci-fi film I've seen. Amy Adams is extraordinary."
  }
}
EOF

echo "--- [29/31] Movie: Everything Everywhere All at Once ---"
grpc_create <<'EOF'
{
  "family_id": "film_tv",
  "line_key": "film-eeaao",
  "type": "EVENT_TYPE_POINT",
  "title": "Everything Everywhere All at Once",
  "icon": "mdi:movie-open",
  "date": "2022-04-10",
  "visibility": "VISIBILITY_PUBLIC",
  "film_tv_metadata": {
    "type": "FILM_TV_TYPE_MOVIE",
    "rating": 5,
    "review": "Chaotic, tender, absurd, and profoundly human. Watched it twice in the same week."
  }
}
EOF

echo "--- [30/31] TV Show: Breaking Bad ---"
grpc_create <<'EOF'
{
  "family_id": "film_tv",
  "line_key": "tv-breaking-bad",
  "type": "EVENT_TYPE_SPAN",
  "title": "Breaking Bad",
  "icon": "mdi:television-play",
  "end_icon": "mdi:television-stop",
  "start_date": "2013-06-01",
  "end_date": "2013-08-20",
  "visibility": "VISIBILITY_PUBLIC",
  "film_tv_metadata": {
    "type": "FILM_TV_TYPE_TV",
    "seasons_watched": 5,
    "rating": 5,
    "review": "Binged all five seasons over a summer. 'I am the one who knocks' is one of TV's best scenes."
  }
}
EOF

echo "--- [31/31] TV Show: Severance ---"
grpc_create <<'EOF'
{
  "family_id": "film_tv",
  "line_key": "tv-severance",
  "type": "EVENT_TYPE_SPAN",
  "title": "Severance",
  "icon": "mdi:television-play",
  "end_icon": "mdi:television-stop",
  "start_date": "2022-03-10",
  "end_date": "2022-04-02",
  "visibility": "VISIBILITY_PUBLIC",
  "film_tv_metadata": {
    "type": "FILM_TV_TYPE_TV",
    "seasons_watched": 1,
    "rating": 5,
    "review": "The most original TV premise in years. That dance sequence is surreal perfection."
  }
}
EOF

echo ""
echo "===== All events created. Reading back via REST API ====="
echo ""

# ── REST reads ────────────────────────────────────────────────────────────────

echo "--- GET /api/lines ---"
curl -s -H "Authorization: Bearer $JWT" "$REST_ADDR/api/lines" | python3 -m json.tool
echo ""

echo "--- GET /api/events?family=travel ---"
curl -s -H "Authorization: Bearer $JWT" "$REST_ADDR/api/events?family=travel" | python3 -m json.tool
echo ""

echo "--- GET /api/events?family=education ---"
curl -s -H "Authorization: Bearer $JWT" "$REST_ADDR/api/events?family=education" | python3 -m json.tool
echo ""

echo "--- GET /api/events?family=employment ---"
curl -s -H "Authorization: Bearer $JWT" "$REST_ADDR/api/events?family=employment" | python3 -m json.tool
echo ""

echo "--- GET /api/events?family=hobbies ---"
curl -s -H "Authorization: Bearer $JWT" "$REST_ADDR/api/events?family=hobbies" | python3 -m json.tool
echo ""

echo "--- GET /api/events?family=books ---"
curl -s -H "Authorization: Bearer $JWT" "$REST_ADDR/api/events?family=books" | python3 -m json.tool
echo ""

echo "--- GET /api/events?family=film_tv ---"
curl -s -H "Authorization: Bearer $JWT" "$REST_ADDR/api/events?family=film_tv" | python3 -m json.tool
echo ""

echo "--- GET /api/timeline (full timeline) ---"
curl -s -H "Authorization: Bearer $JWT" "$REST_ADDR/api/timeline" | python3 -m json.tool
echo ""

echo "===== Done ====="
