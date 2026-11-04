#!/usr/bin/env bash
set -euo pipefail
creator_target="$RUNNER_TEMP/CocosCreator-3.8.8"
creator_app=$(find "$creator_target" -name CocosCreator.app -type d -print -quit 2>/dev/null || true)
if [ -z "$creator_app" ]; then
  creator_archive="$RUNNER_TEMP/CocosCreator-3.8.8.zip"
  creator_url=$(node -p "require('./tools/cocos/toolchain.json').downloadUrl")
  if ! curl --location --fail --retry 1 --connect-timeout 30 --max-time 900 --speed-limit 100000 --speed-time 60 --output "$creator_archive" "$creator_url"; then
    creator_url="${creator_url/download.cocos.com/download.cocos.org}"
    curl --location --fail --retry 1 --connect-timeout 30 --max-time 900 --speed-limit 100000 --speed-time 60 --output "$creator_archive" "$creator_url"
  fi
  shasum -a 256 "$creator_archive"
  mkdir -p "$creator_target"
  ditto -x -k "$creator_archive" "$creator_target"
  creator_app=$(find "$creator_target" -name CocosCreator.app -type d -print -quit)
fi
test -n "$creator_app"
creator_executable="$creator_app/Contents/MacOS/CocosCreator"
test -x "$creator_executable"
creator_engine=$(find "$creator_app/Contents/Resources" -path '*/engine/package.json' -print -quit)
test -n "$creator_engine"
node -e 'const p=require(process.argv[1]); if(p.version!=="3.8.8")throw Error("Unexpected Creator engine "+p.version); console.log("Official Creator engine:",p.version)' "$creator_engine"
echo "COCOS_CREATOR=$creator_executable" >> "$GITHUB_ENV"
