import os

OUTPUT_FILE = "CODEBASE_SOURCE.md"
TARGET_EXTENSIONS = (".ts", ".tsx", ".js", ".jsx", ".json", ".md", ".css")
EXCLUDE_DIRS = {"node_modules", ".next", ".git", "dist", "build", ".turbo"}

with open(OUTPUT_FILE, "w", encoding="utf-8") as out:
    out.write("# Full Codebase Snapshot: FoodiePrep (Zecratary)\n\n")
    
    # 1. Include PROJECT_STATUS.md if present
    if os.path.exists("PROJECT_STATUS.md"):
        out.write("## File: `PROJECT_STATUS.md`\n```markdown\n")
        with open("PROJECT_STATUS.md", "r", encoding="utf-8") as f:
            out.write(f.read())
        out.write("\n```\n\n")

    # 2. Walk through apps/web/src and root configs
    for root, dirs, files in os.walk("."):
        dirs[:] = [d for d in dirs if d not in EXCLUDE_DIRS]
        
        for file in files:
            if file == OUTPUT_FILE or file.endswith(".py"):
                continue
            if file.endswith(TARGET_EXTENSIONS):
                rel_path = os.path.relpath(os.path.join(root, file), ".")
                # Focus primarily on src files, package.json, and tsconfig
                if rel_path.startswith("apps/web/src") or file in ["package.json", "tsconfig.json"]:
                    try:
                        with open(os.path.join(root, file), "r", encoding="utf-8") as f:
                            content = f.read()
                        
                        lang = "typescript" if file.endswith((".ts", ".tsx")) else "json" if file.endswith(".json") else "text"
                        out.write(f"## File: `{rel_path}`\n```{lang}\n{content}\n```\n\n")
                    except Exception:
                        pass

print(f"✅ Generated {OUTPUT_FILE} successfully!")
