
fga tuple read --output-format=simple-json --max-pages=0 > tuples.json
fga tuple delete --file tuples.json
fga tuple write --file tuples.yaml