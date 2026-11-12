#!/usr/bin/env python3
"""Check current spec links, prerequisite artifacts, and requirement/task coverage.
Historical snapshots are intentionally excluded; this is not semantic review or a product test.
"""
from pathlib import Path
import re
import sys

root = Path(__file__).resolve().parent.parent
specs = root / 'specs'
errors = []
features = sorted(specs.glob('[0-9][0-9][0-9]-*'))
for feature in features:
    for filename in ('spec.md', 'plan.md', 'tasks.md'):
        if not (feature / filename).is_file():
            errors.append(f'{feature.name}: missing {filename}')
    if any(not (feature / f).is_file() for f in ('spec.md', 'tasks.md')):
        continue
    requirements = set(re.findall(r'\*\*([A-Z]+-\d{3})\*\*', (feature / 'spec.md').read_text()))
    tasks = (feature / 'tasks.md').read_text()
    mapped = set(re.findall(r'\b[A-Z]+-\d{3}\b', tasks))
    for prefix, start, end in re.findall(r'\b([A-Z]+)-(\d{3})[~–](?:[A-Z]+-)?(\d{3})\b', tasks):
        mapped.update(f'{prefix}-{i:03}' for i in range(int(start), int(end) + 1))
    for missing in sorted(requirements - mapped):
        errors.append(f'{feature.name}: {missing} has no task mapping')
files = [root / 'README.md', root / 'AGENTS.md', root / 'docs/product-brief.md']
files += [p for p in specs.rglob('*.md') if 'archive' not in p.relative_to(specs).parts]
for path in files:
    for href in re.findall(r'\]\(([^)]+)\)', path.read_text()):
        target = href.split('#')[0]
        if target and '://' not in target and not (path.parent / target).exists():
            errors.append(f'{path.relative_to(root)}: missing {target}')
if errors:
    print('\n'.join(errors))
    sys.exit(1)
print(f'{len(features)} feature directories: required files, local links and requirement/task mappings passed.')
