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

echo "===== Creating 20 life events ====="
echo ""

# ── TRAVEL (4 trips) ─────────────────────────────────────────────────────────

echo "--- [1/20] Backpacking Southeast Asia ---"
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
  "metadata": "{\"countries\":[\"Thailand\",\"Vietnam\",\"Cambodia\"],\"cities\":[\"Bangkok\",\"Chiang Mai\",\"Hanoi\",\"Ho Chi Minh City\",\"Siem Reap\"]}"
}
EOF

echo "--- [2/20] Iceland Ring Road Trip ---"
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
  "metadata": "{\"countries\":[\"Iceland\"],\"cities\":[\"Reykjavik\",\"Akureyri\",\"Vik\",\"Hofn\"]}"
}
EOF

echo "--- [3/20] Japan — Tokyo & Kyoto ---"
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
  "metadata": "{\"countries\":[\"Japan\"],\"cities\":[\"Tokyo\",\"Kyoto\",\"Osaka\",\"Nara\"]}"
}
EOF

echo "--- [4/20] Portugal & Spain Road Trip ---"
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
  "metadata": "{\"countries\":[\"Portugal\",\"Spain\"],\"cities\":[\"Lisbon\",\"Porto\",\"Seville\",\"Granada\",\"Madrid\"]}"
}
EOF

# ── EDUCATION (2) ────────────────────────────────────────────────────────────

echo "--- [5/20] BSc Computer Science ---"
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
  "metadata": "{\"institution\":\"University of Toronto\",\"degree\":\"Bachelor of Science, Computer Science\"}"
}
EOF

echo "--- [6/20] MSc Human-Computer Interaction ---"
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
  "metadata": "{\"institution\":\"University of Waterloo\",\"degree\":\"Master of Science, Human-Computer Interaction\"}"
}
EOF

# ── EMPLOYMENT (3) ───────────────────────────────────────────────────────────

echo "--- [7/20] Junior Developer at Acme Software ---"
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
  "metadata": "{\"role\":\"Junior Software Developer\",\"company_name\":\"Acme Software\",\"company_url\":\"https://acme.example.com\"}"
}
EOF

echo "--- [8/20] Senior Engineer at Northstar Technologies ---"
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
  "metadata": "{\"role\":\"Senior Software Engineer\",\"company_name\":\"Northstar Technologies\",\"company_url\":\"https://northstar.example.com\"}"
}
EOF

echo "--- [9/20] Staff Engineer at Meridian Systems (current) ---"
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
  "metadata": "{\"role\":\"Staff Software Engineer\",\"company_name\":\"Meridian Systems\",\"company_url\":\"https://meridian.example.com\"}"
}
EOF

# ── HOBBIES (5) ──────────────────────────────────────────────────────────────

echo "--- [10/20] Started learning guitar ---"
grpc_create <<'EOF'
{
  "family_id": "hobbies",
  "line_key": "hobby-guitar",
  "type": "EVENT_TYPE_POINT",
  "title": "Started Learning Guitar",
  "icon": "mdi:guitar-acoustic",
  "description": "Picked up a second-hand acoustic and started weekly lessons. Currently working through fingerpicking arrangements.",
  "date": "2017-03-15",
  "visibility": "VISIBILITY_PUBLIC",
  "metadata": "{\"activity\":\"guitar\"}"
}
EOF

echo "--- [11/20] Took up photography ---"
grpc_create <<'EOF'
{
  "family_id": "hobbies",
  "line_key": "hobby-photography",
  "type": "EVENT_TYPE_POINT",
  "title": "Took Up Photography",
  "icon": "mdi:camera",
  "description": "Got a mirrorless camera and started shooting street and landscape photography. Travel photos have never been the same.",
  "date": "2019-06-01",
  "visibility": "VISIBILITY_PUBLIC",
  "metadata": "{\"activity\":\"photography\"}"
}
EOF

echo "--- [12/20] Radiohead concert — Madison Square Garden ---"
grpc_create <<'EOF'
{
  "family_id": "hobbies",
  "line_key": "concert-radiohead-msg",
  "type": "EVENT_TYPE_POINT",
  "activity_type": "ACTIVITY_TYPE_CONCERT",
  "title": "Radiohead — In Rainbows From the Basement Tour",
  "icon": "mdi:music",
  "description": "One of the best live shows I've ever seen. Thom Yorke's voice was otherworldly and the light show was extraordinary.",
  "date": "2018-10-08",
  "location": {"label": "Madison Square Garden, New York, NY", "lat": 40.7505, "lng": -73.9934},
  "visibility": "VISIBILITY_PUBLIC",
  "metadata": "{\"artist\":\"Radiohead\",\"venue\":\"Madison Square Garden\"}"
}
EOF

echo "--- [13/20] The National concert — Massey Hall ---"
grpc_create <<'EOF'
{
  "family_id": "hobbies",
  "line_key": "concert-national-massey",
  "type": "EVENT_TYPE_POINT",
  "activity_type": "ACTIVITY_TYPE_CONCERT",
  "title": "The National — First Two Pages of Frankenstein Tour",
  "icon": "mdi:music",
  "description": "Intimate show in one of the world's great concert halls. Bloodbuzz Ohio as the encore was a perfect closer.",
  "date": "2023-05-20",
  "location": {"label": "Massey Hall, Toronto, ON", "lat": 43.6535, "lng": -79.3805},
  "visibility": "VISIBILITY_PUBLIC",
  "metadata": "{\"artist\":\"The National\",\"venue\":\"Massey Hall\"}"
}
EOF

echo "--- [14/20] Joined local cycling club ---"
grpc_create <<'EOF'
{
  "family_id": "hobbies",
  "line_key": "hobby-cycling",
  "type": "EVENT_TYPE_POINT",
  "title": "Joined Local Cycling Club",
  "icon": "mdi:bicycle",
  "description": "Started riding with a local club on weekend group rides. Averaging 80km per Sunday through the summer.",
  "date": "2021-04-10",
  "visibility": "VISIBILITY_PUBLIC",
  "metadata": "{\"activity\":\"cycling\"}"
}
EOF

# ── BOOKS (6) ────────────────────────────────────────────────────────────────

echo "--- [15/20] Book: Dune ---"
grpc_create <<'EOF'
{
  "family_id": "books",
  "line_key": "book-dune",
  "type": "EVENT_TYPE_POINT",
  "activity_type": "ACTIVITY_TYPE_BOOK",
  "title": "Dune",
  "icon": "mdi:book-open-variant",
  "description": "Frank Herbert's seminal sci-fi epic. Dense but rewarding — the ecological and political worldbuilding is unlike anything else.",
  "date": "2014-08-10",
  "visibility": "VISIBILITY_PUBLIC",
  "metadata": "{\"isbn\":\"978-0-441-01359-7\",\"author\":\"Frank Herbert\",\"rating\":5,\"review\":\"Epic science fiction. The worldbuilding is unparalleled.\"}"
}
EOF

echo "--- [16/20] Book: The Name of the Wind ---"
grpc_create <<'EOF'
{
  "family_id": "books",
  "line_key": "book-name-of-wind",
  "type": "EVENT_TYPE_POINT",
  "activity_type": "ACTIVITY_TYPE_BOOK",
  "title": "The Name of the Wind",
  "icon": "mdi:book-open-variant",
  "description": "Patrick Rothfuss writes prose that feels like music. Kvothe is an unreliable narrator done right.",
  "date": "2016-03-20",
  "visibility": "VISIBILITY_PUBLIC",
  "metadata": "{\"isbn\":\"978-0-7564-0407-9\",\"author\":\"Patrick Rothfuss\",\"rating\":5,\"review\":\"Beautiful prose and a deeply compelling narrator.\"}"
}
EOF

echo "--- [17/20] Book: Sapiens ---"
grpc_create <<'EOF'
{
  "family_id": "books",
  "line_key": "book-sapiens",
  "type": "EVENT_TYPE_POINT",
  "activity_type": "ACTIVITY_TYPE_BOOK",
  "title": "Sapiens: A Brief History of Humankind",
  "icon": "mdi:book-open-variant",
  "description": "A sweeping overview of human history that reframes how we think about culture, money, and progress. Occasionally reductive but consistently fascinating.",
  "date": "2017-11-05",
  "visibility": "VISIBILITY_PUBLIC",
  "metadata": "{\"isbn\":\"978-0-06-231609-7\",\"author\":\"Yuval Noah Harari\",\"rating\":4,\"review\":\"Mind-expanding perspective on human history and civilization.\"}"
}
EOF

echo "--- [18/20] Book: Project Hail Mary ---"
grpc_create <<'EOF'
{
  "family_id": "books",
  "line_key": "book-project-hail-mary",
  "type": "EVENT_TYPE_POINT",
  "activity_type": "ACTIVITY_TYPE_BOOK",
  "title": "Project Hail Mary",
  "icon": "mdi:book-open-variant",
  "description": "Andy Weir's best yet. The science is meticulous, the pacing is relentless, and the central friendship is genuinely moving.",
  "date": "2021-08-22",
  "visibility": "VISIBILITY_PUBLIC",
  "metadata": "{\"isbn\":\"978-0-593-13520-4\",\"author\":\"Andy Weir\",\"rating\":5,\"review\":\"Couldn't put it down. Rocky is one of the best characters in sci-fi.\"}"
}
EOF

echo "--- [19/20] Book: The Pragmatic Programmer ---"
grpc_create <<'EOF'
{
  "family_id": "books",
  "line_key": "book-pragmatic-programmer",
  "type": "EVENT_TYPE_POINT",
  "activity_type": "ACTIVITY_TYPE_BOOK",
  "title": "The Pragmatic Programmer",
  "icon": "mdi:book-open-variant",
  "description": "Required reading for any software engineer. The DRY principle and broken windows theory have permanently shaped how I approach code.",
  "date": "2022-03-15",
  "visibility": "VISIBILITY_PERSONAL",
  "metadata": "{\"isbn\":\"978-0-13-595705-9\",\"author\":\"David Thomas & Andrew Hunt\",\"rating\":4,\"review\":\"Essential career reading. Changed how I think about software craft.\"}"
}
EOF

echo "--- [20/20] Book: Never Split the Difference ---"
grpc_create <<'EOF'
{
  "family_id": "books",
  "line_key": "book-never-split",
  "type": "EVENT_TYPE_POINT",
  "activity_type": "ACTIVITY_TYPE_BOOK",
  "title": "Never Split the Difference",
  "icon": "mdi:book-open-variant",
  "description": "Chris Voss applies FBI hostage negotiation tactics to everyday life. The tactical empathy framework is immediately practical.",
  "date": "2023-10-30",
  "visibility": "VISIBILITY_PUBLIC",
  "metadata": "{\"isbn\":\"978-0-06-240780-1\",\"author\":\"Chris Voss\",\"rating\":4,\"review\":\"Surprisingly practical. The mirroring and labelling techniques actually work.\"}"
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

echo "--- GET /api/timeline (full timeline) ---"
curl -s -H "Authorization: Bearer $JWT" "$REST_ADDR/api/timeline" | python3 -m json.tool
echo ""

echo "===== Done ====="
