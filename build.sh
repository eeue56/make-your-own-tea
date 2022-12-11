#!/bin/bash
git checkout main
git checkout -b make-your-own-tea-post-1

for i in {1..13}
do
    cat "src/$i.txt"
    cp "src/$i.ts" src/index.ts
    git add src/index.ts
    git commit src/index.ts -F "src/$i.txt"
done