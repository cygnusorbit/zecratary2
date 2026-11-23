import json
import os
import sys

# Target version from command argument or fallback to default
target_version = sys.argv[1] if len(sys.argv) > 1 else "1.0.1"

# Target package files
target_files = [
    'package.json',
    'apps/web/package.json'
]

updated = []

for file_path in target_files:
    if os.path.exists(file_path):
        try:
            with open(file_path, 'r', encoding='utf-8') as f:
                data = json.load(f)

            prev_version = data.get('version', 'none')
            data['version'] = target_version

            with open(file_path, 'w', encoding='utf-8') as f:
                json.dump(data, f, indent=2)
                f.write('\n')

            print(f"✓ Successfully updated {file_path}: v{prev_version} -> v{target_version}")
            updated.append(file_path)
        except Exception as err:
            print(f"❌ Error updating {file_path}: {err}")
    else:
        print(f"⚠️ Notice: File not found: {file_path}")

if not updated:
    print("❌ No package.json files were updated.")
    sys.exit(1)
else:
    print(f"\n✅ Version synchronized to v{target_version} across all detected files.")
