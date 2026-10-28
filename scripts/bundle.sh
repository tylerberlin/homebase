#!/bin/sh
# Package the standalone build (server.js + traced node_modules + static assets) into
# homebase.tgz. tar keeps pnpm's symlinks intact, so copy the tarball, not the folder.
set -e
rm -rf deploy homebase.tgz
cp -R .next/standalone deploy
mkdir -p deploy/.next
cp -R .next/static deploy/.next/static
[ -d public ] && cp -R public deploy/public
COPYFILE_DISABLE=1 tar --no-xattrs --no-mac-metadata -czf homebase.tgz -C deploy .
echo "Built homebase.tgz ($(du -h homebase.tgz | cut -f1))"
