#!/usr/bin/env bash
# Downloads the template photos into var/demo-images (needs access to unsplash.com, e.g. a VPN).
# Already downloaded photos are skipped, so it is safe to run again.
set -uo pipefail
cd "$(dirname "$0")"
target=../../var/demo-images
mkdir -p "$target"
ok=0; skipped=0; failed=0
while IFS=$'\t' read -r id template url; do
  case "$id" in ''|\#*) continue ;; esac
  file="$target/$id.jpg"
  if [ -f "$file" ]; then skipped=$((skipped + 1)); continue; fi
  if curl -fsSL --max-time 60 -o "$file" "$url" && [ "$(wc -c < "$file")" -ge 10000 ]; then
    ok=$((ok + 1)); echo "OK      $id ($template)"
  else
    rm -f "$file"; failed=$((failed + 1)); echo "FAILED  $id ($template)"
  fi
done < template-photos.txt
echo
echo "Downloaded: $ok   Already there: $skipped   Failed: $failed"
echo 'Then, in the studio: Client sites -> "Refresh photos" on each site.'
